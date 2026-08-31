from __future__ import annotations

import base64
import io
import json
import stat
import zipfile
from pathlib import Path

import geopandas as gpd
import pytest
from shapely.geometry import Point

from geoharness_geo import LayerRegistry, WorkspaceStore, import_capabilities, import_uploaded_layer


def encode(content: bytes) -> str:
    return base64.b64encode(content).decode("ascii")


def sample_frame() -> gpd.GeoDataFrame:
    return gpd.GeoDataFrame(
        {"feature_id": ["A", "B"], "value": [10, 20]},
        geometry=[Point(-74.011, 40.708), Point(-74.002, 40.716)],
        crs="EPSG:4326",
    )


def test_imports_real_geojson_shapefile_gpkg_and_csv_into_canonical_layers(tmp_path: Path):
    root = tmp_path / "workspace"
    registry = LayerRegistry(root)
    workspace = WorkspaceStore(root, workspace_id="upload-session", session_id="upload:session")
    source_root = tmp_path / "sources"
    source_root.mkdir()
    frame = sample_frame()

    geojson_path = source_root / "points.geojson"
    frame.to_file(geojson_path, driver="GeoJSON", engine="pyogrio")
    geojson = import_uploaded_layer(
        registry,
        workspace,
        file_name=geojson_path.name,
        content_base64=encode(geojson_path.read_bytes()),
        name="Uploaded points",
    )
    assert geojson["format"] == "geojson"
    assert geojson["metadata"]["source"] == "upload"
    assert geojson["metadata"]["feature_count"] == 2

    shape_root = source_root / "shape"
    shape_root.mkdir()
    shape_path = shape_root / "sample_points.shp"
    frame.to_file(shape_path, driver="ESRI Shapefile", engine="pyogrio")
    shape_zip = source_root / "sample-points.zip"
    with zipfile.ZipFile(shape_zip, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for child in shape_root.iterdir():
            archive.write(child, arcname=f"nested/{child.name}")
    shapefile = import_uploaded_layer(
        registry,
        workspace,
        file_name=shape_zip.name,
        content_base64=encode(shape_zip.read_bytes()),
    )
    assert shapefile["format"] == "shapefile"
    assert shapefile["source_layer"] == "sample_points.shp"
    assert shapefile["metadata"]["feature_count"] == 2

    gpkg_path = source_root / "multi.gpkg"
    frame.to_file(gpkg_path, layer="first", driver="GPKG", engine="pyogrio")
    shifted = frame.copy()
    shifted.geometry = shifted.geometry.translate(xoff=0.02)
    shifted.to_file(gpkg_path, layer="second", driver="GPKG", engine="pyogrio", mode="a")
    gpkg = import_uploaded_layer(
        registry,
        workspace,
        file_name=gpkg_path.name,
        content_base64=encode(gpkg_path.read_bytes()),
        source_layer="second",
    )
    assert gpkg["format"] == "gpkg"
    assert gpkg["source_layer"] == "second"
    assert registry.get(gpkg["metadata"]["layer_id"]).total_bounds[0] > -74.0

    csv_content = b"id,lng,lat,category\n1,-74.01,40.71,valid\n2,-74.00,40.72,valid\n3,999,40.70,invalid\n"
    csv = import_uploaded_layer(
        registry,
        workspace,
        file_name="observations.csv",
        content_base64=encode(csv_content),
        longitude_field="lng",
        latitude_field="lat",
        crs="EPSG:4326",
    )
    assert csv["format"] == "csv"
    assert csv["metadata"]["geometry"] == "Point"
    assert csv["metadata"]["feature_count"] == 2
    assert csv["warnings"] == ["Dropped 1 rows with missing or out-of-range coordinates."]

    manifest = WorkspaceStore(root, workspace_id="upload-session", session_id="upload:session").manifest()
    assert len(manifest.imports) == 4
    assert len(manifest.input_layers) == 4
    assert manifest.derived_layers == []
    assert {item.format for item in manifest.imports} == {"geojson", "shapefile", "gpkg", "csv"}
    assert all((root / item.path).is_file() for item in manifest.imports)
    assert [layer.layer_id for layer in LayerRegistry(root).list_layers()] == [
        "layer_0001", "layer_0002", "layer_0003", "layer_0004",
    ]
    assert import_capabilities()["max_file_bytes"] == 20 * 1024 * 1024


def malicious_zip(*, symlink: bool = False) -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        if symlink:
            info = zipfile.ZipInfo("linked.shp")
            info.external_attr = (stat.S_IFLNK | 0o777) << 16
            archive.writestr(info, "target.shp")
        else:
            archive.writestr("../escape.shp", "not a shapefile")
    return output.getvalue()


@pytest.mark.parametrize(
    ("file_name", "content", "max_bytes", "message"),
    [
        ("../escape.geojson", b"{}", 1024, "safe filename"),
        ("oversize.geojson", b"0123456789", 4, "exceeds"),
        ("attack.zip", malicious_zip(), 1024 * 1024, "Unsafe ZIP member"),
        ("symlink.zip", malicious_zip(symlink=True), 1024 * 1024, "symbolic links"),
        ("broken.geojson", b'{"type":"FeatureCollection"}', 1024, "features"),
    ],
)
def test_failed_or_malicious_imports_leave_no_layer_or_workspace_artifact(
    tmp_path: Path,
    file_name: str,
    content: bytes,
    max_bytes: int,
    message: str,
):
    root = tmp_path / "workspace"
    registry = LayerRegistry(root)
    workspace = WorkspaceStore(root, workspace_id="secure", session_id="secure")

    with pytest.raises(Exception, match=message):
        import_uploaded_layer(
            registry,
            workspace,
            file_name=file_name,
            content_base64=encode(content),
            max_upload_bytes=max_bytes,
        )

    assert registry.list_layers() == []
    assert workspace.manifest().imports == []
    assert workspace.manifest().input_layers == []
    assert list(workspace.imports_root.iterdir()) == []
    assert not (tmp_path / "escape.shp").exists()


def test_multilayer_geopackage_requires_an_explicit_layer_without_residue(tmp_path: Path):
    source = tmp_path / "multi.gpkg"
    frame = sample_frame()
    frame.to_file(source, layer="first", driver="GPKG", engine="pyogrio")
    frame.to_file(source, layer="second", driver="GPKG", engine="pyogrio", mode="a")
    root = tmp_path / "workspace"
    registry = LayerRegistry(root)
    workspace = WorkspaceStore(root, workspace_id="gpkg", session_id="gpkg")

    with pytest.raises(ValueError, match="requires source_layer.*first, second"):
        import_uploaded_layer(
            registry,
            workspace,
            file_name=source.name,
            content_base64=encode(source.read_bytes()),
        )

    assert registry.list_layers() == []
    assert workspace.manifest().imports == []
    assert list(workspace.imports_root.iterdir()) == []
