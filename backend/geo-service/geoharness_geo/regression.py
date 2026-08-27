from __future__ import annotations

from typing import Any

import geopandas as gpd

from .operations.tools import METRIC_CRS
from .registry import LayerRegistry


class ScenarioRegression:
    """Independent spatial/statistical oracle for supported Scenario outputs."""

    def __init__(self, registry: LayerRegistry, layer_aliases: dict[str, str]):
        self.registry = registry
        self.layer_aliases = layer_aliases

    def frame(self, alias: str) -> gpd.GeoDataFrame:
        try:
            layer_id = self.layer_aliases[alias]
        except KeyError as error:
            raise ValueError(f"Regression is missing Layer alias: {alias}") from error
        return self.registry.get(layer_id)

    @staticmethod
    def distance_to(source: gpd.GeoDataFrame, target: gpd.GeoDataFrame) -> list[float]:
        source_metric = source.to_crs(METRIC_CRS)
        target_metric = target.to_crs(METRIC_CRS)
        target_union = target_metric.geometry.union_all()
        return [float(geometry.distance(target_union)) for geometry in source_metric.geometry]

    @staticmethod
    def district_counts(frame: gpd.GeoDataFrame) -> dict[str, int]:
        return {
            str(row["district_id"]): int(row["feature_count"])
            for _, row in frame.iterrows()
        }

    def validate(self, scenario_id: str) -> dict[str, Any]:
        validators = {
            "01-building-data-inspection": self.building_inspection,
            "02-river-building-query": self.river_query,
            "03-building-statistics-by-district": self.district_statistics,
            "04-road-accessibility": self.road_accessibility,
            "05-parameter-revision": self.parameter_revision_initial,
            "06-multi-constraint-selection": self.multi_constraint,
            "07-official-nyc-building-inspection": self.official_building_inspection,
        }
        try:
            return validators[scenario_id]()
        except KeyError as error:
            raise ValueError(f"Unknown Scenario regression: {scenario_id}") from error

    def building_inspection(self) -> dict[str, Any]:
        buildings = self.frame("buildings")
        metric = buildings.to_crs(METRIC_CRS)
        geometry_types = sorted(set(buildings.geom_type.dropna().tolist()))
        statistics = {
            "feature_count": len(buildings),
            "geometry_type": geometry_types[0] if len(geometry_types) == 1 else "Mixed",
            "crs": "OGC:CRS84" if buildings.crs is not None and buildings.crs.is_geographic else str(buildings.crs),
            "invalid_geometry_count": int((~buildings.geometry.is_valid).sum()),
            "missing_height_m_count": int(buildings["height_m"].isna().sum()),
            "total_building_area_m2": float(metric.geometry.area.sum()),
        }
        return {
            "statistics": statistics,
            "checks": {
                "feature_count": statistics["feature_count"] == 12,
                "polygon_geometry": statistics["geometry_type"] == "Polygon",
                "valid_geometry": statistics["invalid_geometry_count"] == 0,
                "positive_area": statistics["total_building_area_m2"] > 0,
            },
        }

    def official_building_inspection(self) -> dict[str, Any]:
        buildings = self.frame("buildings")
        metric = buildings.to_crs(METRIC_CRS)
        years = buildings["construction_year"].dropna()
        geometry_types = sorted(set(buildings.geom_type.dropna().tolist()))
        statistics = {
            "feature_count": len(buildings),
            "geometry_type": geometry_types[0] if len(geometry_types) == 1 else "Mixed",
            "crs": "OGC:CRS84" if buildings.crs is not None and buildings.crs.is_geographic else str(buildings.crs),
            "invalid_geometry_count": int((~buildings.geometry.is_valid).sum()),
            "missing_height_roof_ft_count": int(buildings["height_roof_ft"].isna().sum()),
            "missing_construction_year_count": int(buildings["construction_year"].isna().sum()),
            "construction_year_min": int(years.min()),
            "construction_year_max": int(years.max()),
            "total_building_area_m2": float(metric.geometry.area.sum()),
        }
        return {
            "statistics": statistics,
            "checks": {
                "official_feature_count": statistics["feature_count"] == 133,
                "multipolygon_geometry": statistics["geometry_type"] == "MultiPolygon",
                "valid_geometry": statistics["invalid_geometry_count"] == 0,
                "positive_area": statistics["total_building_area_m2"] > 0,
                "audited_year_range": (
                    statistics["construction_year_min"] == 1830
                    and statistics["construction_year_max"] == 2021
                ),
            },
        }

    def river_query(self) -> dict[str, Any]:
        candidates = self.frame("candidate_buildings")
        distances = self.distance_to(candidates, self.frame("rivers"))
        within = all(distance <= 500.5 for distance in distances)
        return {
            "statistics": {
                "candidate_buildings_count": len(candidates),
                "maximum_river_distance_m": max(distances, default=None),
            },
            "checks": {"all_candidates_within_500m_of_river": within},
        }

    def district_statistics(self) -> dict[str, Any]:
        buildings = self.frame("buildings")
        statistics_layer = self.frame("district_statistics")
        counts = self.district_counts(statistics_layer)
        positive_area = bool((statistics_layer["area_sum_m2"] > 0).all())
        return {
            "statistics": {
                "total_buildings_count": len(buildings),
                "district_counts": counts,
                "district_count": len(statistics_layer),
            },
            "checks": {
                "district_counts_sum_to_total": sum(counts.values()) == len(buildings),
                "all_district_area_sums_m2_positive": positive_area,
            },
        }

    def road_accessibility(self) -> dict[str, Any]:
        candidates = self.frame("accessible_buildings")
        distances = self.distance_to(candidates, self.frame("major_roads"))
        statistics_layer = self.frame("accessibility_by_district")
        counts = self.district_counts(statistics_layer)
        return {
            "statistics": {
                "accessible_buildings_count": len(candidates),
                "district_counts": counts,
                "maximum_major_road_distance_m": max(distances, default=None),
            },
            "checks": {
                "all_candidates_within_300m_of_major_road": all(distance <= 300.5 for distance in distances),
                "district_counts_sum_to_candidates": sum(counts.values()) == len(candidates),
            },
        }

    def parameter_revision_initial(self) -> dict[str, Any]:
        candidates = self.frame("candidate_buildings")
        distances = self.distance_to(candidates, self.frame("major_roads"))
        buffer_metadata = self.registry.metadata(self.layer_aliases["major_road_buffer"])
        distance_m = float((buffer_metadata.parameters or {}).get("distance_m", -1))
        statistics: dict[str, Any] = {
            "current_candidate_count": len(candidates),
            "current_buffer_distance_m": distance_m,
        }
        checks: dict[str, bool] = {
            "all_current_candidates_within_distance": all(distance <= distance_m + 0.5 for distance in distances),
        }
        if distance_m == 500:
            statistics.update({"initial_candidate_count": len(candidates), "initial_buffer_distance_m": distance_m})
            checks.update({
                "initial_distance_is_500m": True,
                "all_initial_candidates_within_500m": all(distance <= 500.5 for distance in distances),
            })
        if distance_m == 1000:
            statistics.update({"revised_candidate_count": len(candidates), "revised_buffer_distance_m": distance_m})
            checks.update({
                "revised_distance_is_1000m": True,
                "all_revised_candidates_within_1000m": all(distance <= 1000.5 for distance in distances),
            })
        return {"statistics": statistics, "checks": checks}

    def multi_constraint(self) -> dict[str, Any]:
        candidates = self.frame("candidate_buildings")
        road_distances = self.distance_to(candidates, self.frame("major_roads"))
        river_distances = self.distance_to(candidates, self.frame("rivers"))
        return {
            "statistics": {
                "candidate_buildings_count": len(candidates),
                "maximum_major_road_distance_m": max(road_distances, default=None),
                "minimum_river_distance_m": min(river_distances, default=None),
            },
            "checks": {
                "all_candidates_within_300m_of_major_road": all(distance <= 300.5 for distance in road_distances),
                "all_candidates_at_least_800m_from_river": all(distance >= 799.5 for distance in river_distances),
            },
        }
