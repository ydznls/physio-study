"""Read user-owned files. No source files or parsed text are stored in this repository."""
import sys,json,struct,zipfile,xml.etree.ElementTree as ET
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
def doc_text(b):
    if b[:8]!=bytes.fromhex('d0cf11e0a1b11ae1'):raise ValueError('不是有效的旧版Word文档')
    u16=lambda x,o:struct.unpack_from('<H',x,o)[0]
    u32=lambda x,o:struct.unpack_from('<I',x,o)[0]
    ss=1<<u16(b,30)
    if ss not in (512,4096):raise ValueError('不支持的Word扇区格式')
    def sec(n):return b[(n+1)*ss:(n+2)*ss]
    ids=[n for n in struct.unpack_from('<109I',b,76) if n<0xfffffffa]
    d=u32(b,68)
    for _ in range(min(u32(b,72),10000)):
        if d>=0xfffffffa:break
        a=struct.unpack('<'+'I'*(ss//4),sec(d));ids.extend(n for n in a[:-1] if n<0xfffffffa);d=a[-1]
    fat=[]
    for n in ids:fat.extend(struct.unpack('<'+'I'*(ss//4),sec(n)))
    def stream(n,size=None):
        out=[];seen=set()
        while n<0xfffffffa and n not in seen:
            if n>=len(fat):raise ValueError('损坏的Word数据链')
            seen.add(n);out.append(sec(n));n=fat[n]
        return b''.join(out)[:size]
    entries={};directory=stream(u32(b,48))
    for o in range(0,len(directory)-127,128):
        e=directory[o:o+128];nl=u16(e,64)
        if nl:entries[e[:nl-2].decode('utf-16le')]=(u32(e,116),u32(e,120))
    w=stream(*entries['WordDocument']);tab=stream(*entries['1Table' if u16(w,10)&0x200 else '0Table'])
    o=32;o+=2+2*u16(w,o);o+=2+4*u16(w,o);o+=2
    fc,lcb=struct.unpack_from('<II',w,o+33*8);clx=tab[fc:fc+lcb];p=0
    while clx[p]==1:p+=3+u16(clx,p+1)
    if clx[p]!=2:raise ValueError('不支持的Word文本结构，请另存为DOCX')
    pt=clx[p+5:p+5+u32(clx,p+1)];count=(len(pt)-4)//12;cps=struct.unpack_from('<'+'I'*(count+1),pt);parts=[]
    for i in range(count):
        off=u32(pt,4*(count+1)+8*i+2);compressed=bool(off&0x40000000);off&=0x3fffffff
        if compressed:off//=2
        length=cps[i+1]-cps[i];parts.append(w[off:off+length*(1 if compressed else 2)].decode('cp1252' if compressed else 'utf-16le',errors='replace'))
    return ''.join(parts).replace('\r','\n').replace('\x07',' | ')
def extract(file,ext):
    if ext=='pdf':
        from pypdf import PdfReader
        reader=PdfReader(file)
        if len(reader.pages)>1500:raise ValueError('文件超过1500页，请分章上传')
        pages=[{'page':i+1,'text':p.extract_text() or ''} for i,p in enumerate(reader.pages)]
        empty=sum(not p['text'].strip() for p in pages)
        return {'pages':pages,'warning':f'{empty}页无可提取文字，可能是图片/扫描页；当前版本不含OCR。' if empty else ''}
    if ext=='doc':text=doc_text(Path(file).read_bytes())
    elif ext=='docx':
        with zipfile.ZipFile(file) as z:
            info=z.getinfo('word/document.xml')
            if info.file_size>20*1024*1024:raise ValueError('DOCX解压内容过大')
            root=ET.fromstring(z.read(info));ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
            text='\n'.join(''.join(p.itertext()) for p in root.findall('.//w:p',ns))
    else:
        data=Path(file).read_bytes()
        try:text=data.decode('utf-8-sig')
        except UnicodeDecodeError:text=data.decode('gb18030')
    # Non-PDF files have logical text segments, not physical Word pages.
    return {'pages':[{'page':i+1,'text':text[o:o+12000]} for i,o in enumerate(range(0,len(text),12000))], 'warning':'非PDF页号为文本分段序号，不能当作原文纸张页码。旧版DOC解析保留文字，格式重点需核对。' if ext in ('doc','docx') else ''}
if __name__=='__main__':
    try:print(json.dumps(extract(sys.argv[1],sys.argv[2]),ensure_ascii=False))
    except Exception as e:print(str(e),file=sys.stderr);sys.exit(1)
