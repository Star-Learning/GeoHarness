"""Package supported-browser screen captures, with an explicit edit audit.

No mocked UI, no fabricated Agent text, and no imagery/classification replay.
"""
from __future__ import annotations
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import subprocess
import wave
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--capture", type=Path, required=True)
parser.add_argument("--session", required=True)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
args.output.parent.mkdir(parents=True, exist_ok=True)
font = lambda size, bold=False: ImageFont.truetype("C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc",size)

# Verified against the actual source contact sheet, not assumed Tool timings.
segments = [
    ("final-recording", 1, 16, .5, "一句话，让 GIS Agent 巡检洪山区", "基于 DeepSeek Harness · 真实会话与工具执行"),
    ("final-recording", 17, 105, 2, "01  理解需求，选择影像巡检工具", "过程实录 · 无新内容的等待已压缩"),
    ("final-recording", 106, 150, 1, "02  从当前视图飞往目标区域", "缩小 → 移动 → 放大 · 定位使用历史真实地名缓存"),
    ("final-recording", 151, 180, 1, "03  校验行政边界，锁定分析范围", "OpenStreetMap 真实边界缓存 · 非官方法定边界"),
    ("final-recording", 181, 337, 3, "04  获取影像，处理行政区内像素", "12 张 Esri 在线瓦片 · 等待已压缩"),
    ("final-recording", 338, 516, 3, "05  蒙版已生成，Agent 整理报告", "图层来自本次重新计算 · 等待已压缩"),
    ("final-recording", 517, 613, 1, "06  Agent 输出中文报告与分类表", "RGB 启发式视觉初筛 · 不等于地物识别精度或实测面积"),
    ("final-ending", 1, 48, 1, "07  查看结构化结果，管理分析图层", "真实边界缓存：2026-09-01 · 影像与分类：本次重新执行"),
    ("final-ending", 49, 72, 1, "蒙版也是图层：一键对照卫星底图", "关闭 / 显示 · 不改变真实分析数据"),
    ("final-ending", 73, 112, 1, "调整透明度，让结果与影像同时可见", "显示不透明度调整到 52% · 地图没有重置或空白"),
    ("final-ending", 113, 176, 1, "从一句需求，到地图、图层与报告", "RGB 启发式演示 · 模型文字仍需人工核查"),
]

sources = {}
sizes = Counter()
for group in ("final-recording", "final-ending"):
    paths = sorted((args.capture/group/"frames").glob("frame-*.jpg"))
    for index, path in enumerate(paths,1):
        if path.name != f"frame-{index:06d}.jpg":
            raise ValueError(f"Missing source frame: {group}/{index}")
        with Image.open(path) as image:
            if image.size not in ((1920,1080),(2560,1440)):
                raise ValueError(f"Unexpected source dimensions: {path} {image.size}")
            sizes[str(image.size)] += 1
        sources[(group,index)] = path

timeline=[]
edit=[]
for group,start,end,speed,title,subtitle in segments:
    count=round((end-start+1)/speed)
    begin=len(timeline)/8
    for offset in range(count):
        index=min(end,start+int(offset*speed))
        timeline.append((sources[(group,index)],title,subtitle,group))
    edit.append({"source":group,"first_frame":start,"last_frame":end,"speed":speed,"start_seconds":begin,"end_seconds":len(timeline)/8,"caption":title})
duration=len(timeline)/8

# Quiet, original synthesized accompaniment; no third-party recording or samples.
sample_rate=48000
music=np.zeros(round(duration*sample_rate),dtype=np.float64)
beat=60/82
chords=((48,55,59,64),(45,52,55,60),(41,48,52,57),(43,50,55,60))
def tone(start, length, notes, gain):
    offset=round(start*sample_rate)
    n=min(round(length*sample_rate),len(music)-offset)
    if n<=0:return
    t=np.arange(n)/sample_rate
    envelope=np.minimum(1,t/.6)*np.minimum(1,(length-t)/1.1)*np.exp(-t/length*.55)
    signal=np.zeros(n)
    for note in notes:
        hz=440*2**((note-69)/12)
        signal+=np.sin(2*np.pi*hz*t)+.16*np.sin(2*np.pi*hz*2*t)
    music[offset:offset+n]+=gain*envelope*signal/len(notes)
for index,start in enumerate(np.arange(0,duration,beat*8)):
    chord=chords[index%4]
    tone(float(start),beat*8.8,chord,.065)
    for j in range(4):tone(float(start+beat*j*2),beat*2.5,(chord[(j+index)%4]+12,),.019)
fade=np.minimum(1,np.arange(len(music))/(sample_rate*2))*np.minimum(1,(len(music)-np.arange(len(music)))/(sample_rate*4))
pcm=(np.clip(music*fade,-.9,.9)*32767).astype('<i2')
music_path=args.capture/'original-ambient.wav'
with wave.open(str(music_path),'wb') as audio:
    audio.setnchannels(1);audio.setsampwidth(2);audio.setframerate(sample_rate);audio.writeframes(pcm.tobytes())

command=['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s','1920x1080','-r','8','-i','pipe:0',
         '-i',str(music_path),'-vf','fps=60,setsar=1,format=yuv420p','-c:v','libx264','-preset','medium','-crf','17',
         '-profile:v','high','-level:v','4.2','-threads','6','-c:a','aac','-b:a','160k','-ar','48000','-ac','2',
         '-movflags','+faststart','-t',str(duration),str(args.output)]
process=subprocess.Popen(command,stdin=subprocess.PIPE)
for index,(path,title,subtitle,group) in enumerate(timeline):
    with Image.open(path) as original:
        frame=original.convert('RGB').resize((1920,1080),Image.Resampling.LANCZOS)
        # A labelled editorial detail view keeps the native report text legible
        # after the capture viewport expanded. It uses the same current frame.
        detail = None
        if original.size == (2560,1440) and title.startswith('06'):
            detail=original.crop((2070,380,2550,1275)).convert('RGB').resize((510,951),Image.Resampling.LANCZOS)
    draw=ImageDraw.Draw(frame)
    # Unused product-header space: never cover the map, report, or composer.
    draw.rectangle((340,0,1370,48),fill='white')
    draw.text((855,3),title,font=font(23,True),fill='#172b46',anchor='mt')
    draw.text((855,30),subtitle,font=font(13),fill='#5b6a7e',anchor='mt')
    if detail is not None:
        draw.rounded_rectangle((1393,58,1916,1038),radius=12,fill='white',outline='#58a9a6',width=3)
        frame.paste(detail,(1399,83))
        draw.text((1411,62),'Agent 实时输出 · 局部放大',font=font(15,True),fill='#245554')
    if group=='final-ending':
        alpha=(np.sin(index/8*2.4)+1)/2
        colour=(int(26+alpha*20),int(143+alpha*36),int(145+alpha*35))
        draw.rounded_rectangle((23,906,1403,1037),radius=13,outline=colour,width=3)
    process.stdin.write(frame.tobytes())
    if index%160==0:print(f'Encoded source frame {index}/{len(timeline)}',flush=True)
process.stdin.close()
if process.wait()!=0:raise RuntimeError('Video encoding failed')

cover=Image.open(args.capture/'final-ending/final.jpg').convert('RGB')
overlay=Image.new('RGBA',cover.size)
d=ImageDraw.Draw(overlay)
d.rounded_rectangle((74,166,1230,437),radius=24,fill=(9,24,36,235))
d.text((112,194),'GeoHarness：一句话巡检洪山区',font=font(52,True),fill='#ffffff')
d.text((114,274),'GIS Agent · 从卫星影像到分析报告',font=font(34),fill='#bce8e3')
d.text((114,347),'真实执行 / 行政边界裁剪 / 图层与报告联动',font=font(24),fill='#d7e2eb')
cover=Image.alpha_composite(cover.convert('RGBA'),overlay).convert('RGB')
cover.save(args.output.with_suffix('.cover.jpg'),quality=95,subsampling=0)
inspection=json.loads((ROOT/'.geoharness/workspaces'/args.session/'imagery/latest.json').read_text(encoding='utf-8'))
manifest={
    'schema_version':'1.0','session_id':args.session,'prompt':'全程中文巡检武汉市洪山区卫星影像，200字简报，附分类表与局限。',
    'source_dimensions':dict(sizes),'source_capture':'supported-browser screenshots, requested 8 fps; not native 60 fps recording',
    'capture_limitations':'One bounded capture call timed out after frame 613; all persisted frames retained. Viewport changed from 1080p to 1440p mid-capture. Output normalized with Lanczos. No missing frames inside either saved sequence; unrecorded inter-chunk waits are omitted.',
    'edit_timeline':edit,'duration_seconds':duration,'output_resolution':[1920,1080],'output_fps':60,
    'report_detail_view':'During chapter 06 only, the same 1440p frame report crop (2070,380,2550,1275) is enlarged to 510x951 for legibility and labelled as a detail view.',
    'frame_rate_conversion':'frame repetition, no synthetic UI/text/analysis frames',
    'audio':'Original synthesized low-volume ambient accompaniment. No external music or samples.',
    'layout_verification':json.loads((args.capture/'final-ending/layout.json').read_text(encoding='utf-8')),
    'analysis':{key:inspection[key] for key in ('inspection_id','created_at','tile_count','tile_zoom','pixel_width','pixel_height','analysis_scope','categories','classified_pixel_ratio','method','overlay_layer')},
    'boundary_cache':inspection['resolved_place']['cache_provenance'],
    'final_status':'success','video':args.output.name,'sha256':hashlib.sha256(args.output.read_bytes()).hexdigest(),
}
args.output.with_suffix('.manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'duration':duration,'file':str(args.output),'bytes':args.output.stat().st_size,'source_dimensions':dict(sizes)},ensure_ascii=True),flush=True)
