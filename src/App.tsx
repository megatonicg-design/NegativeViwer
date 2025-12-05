import React, { useState, useRef, useEffect } from 'react';
import './App.css';

// 1. 定義 Settings 介面
interface Settings {
  brightness: number;
  contrast: number;
  // 黑位 (Shadows)
  rShadow: number;
  gShadow: number;
  bShadow: number;
  // 中光位 (Midtones)
  rMid: number;
  gMid: number;
  bMid: number;
  // 高光 (Highlights)
  rHigh: number;
  gHigh: number;
  bHigh: number;
}

export default function App() {
  // --- 狀態管理 ---
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);
  const [isPickingBase, setIsPickingBase] = useState<boolean>(false);
  
  // 預設片基顏色
  const defaultBaseColor = { r: 240, g: 170, b: 140 };
  const [baseColor, setBaseColor] = useState(defaultBaseColor); 
  
  // 掃描曝光
  const [baseExposure, setBaseExposure] = useState<number>(1.1); 

  // 調色參數
  const [settings, setSettings] = useState<Settings>({
    brightness: 1.0,
    contrast: 1.1,
    rShadow: 0, gShadow: 0, bShadow: 0,
    rMid: 0, gMid: 0, bMid: 0,
    rHigh: 0, gHigh: 0, bHigh: 0
  });

  // 放大鏡狀態
  const [magnifierState, setMagnifierState] = useState({
    show: false, x: 0, y: 0, bgX: 0, bgY: 0, bgWidth: 0, bgHeight: 0
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const originalDataRef = useRef<ImageData | null>(null);
  const previewUrlRef = useRef<string>('');

  // 監聽變化
  useEffect(() => {
    if (imageLoaded) processImage();
  }, [baseColor, baseExposure, settings, imageLoaded]);

  // --- 處理圖片上載 ---
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const maxWidth = 1000;
        const scale = Math.min(1, maxWidth / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        originalDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        setImageLoaded(true);
        // 重置
        setBaseColor(defaultBaseColor);
        setBaseExposure(1.1); 
        resetSettings();
        setIsPickingBase(false);
        
        setTimeout(processImage, 50);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // --- 核心影像處理 ---
  const processImage = () => {
    if (!originalDataRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const newData = new ImageData(
      new Uint8ClampedArray(originalDataRef.current.data),
      originalDataRef.current.width,
      originalDataRef.current.height
    );
    const data = newData.data;

    const { r: baseR, g: baseG, b: baseB } = baseColor;
    const { 
      brightness, contrast, 
      rShadow, gShadow, bShadow, 
      rMid, gMid, bMid, 
      rHigh, gHigh, bHigh 
    } = settings;

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i]; let g = data[i+1]; let b = data[i+2];

      // A. 去色罩 + 曝光補償
      r = baseR > 10 ? (r / baseR) * 255 * baseExposure : r;
      g = baseG > 10 ? (g / baseG) * 255 * baseExposure : g;
      b = baseB > 10 ? (b / baseB) * 255 * baseExposure : b;

      // B. 反轉
      r = 255 - r;
      g = 255 - g;
      b = 255 - b;

      // C. 分離色調處理
      // 1. 黑位
      r += rShadow; g += gShadow; b += bShadow;

      // 2. 高光
      r *= (1 + rHigh / 100);
      g *= (1 + gHigh / 100);
      b *= (1 + bHigh / 100);

      // 3. 中光位
      if (rMid !== 0) r = 255 * Math.pow(Math.max(0, r / 255), 1 / (1 + rMid / 50));
      if (gMid !== 0) g = 255 * Math.pow(Math.max(0, g / 255), 1 / (1 + gMid / 50));
      if (bMid !== 0) b = 255 * Math.pow(Math.max(0, b / 255), 1 / (1 + bMid / 50));

      // D. 亮度
      r *= brightness; g *= brightness; b *= brightness;

      // E. 對比度
      r = contrast * (r - 128) + 128;
      g = contrast * (g - 128) + 128;
      b = contrast * (b - 128) + 128;

      data[i] = r; data[i+1] = g; data[i+2] = b;
    }
    ctx.putImageData(newData, 0, 0);
    previewUrlRef.current = canvas.toDataURL(); 
  };

  // --- 放大鏡 ---
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPickingBase || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const pointerX = e.clientX - rect.left;
    const pointerY = e.clientY - rect.top;

    if (pointerX < 0 || pointerY < 0 || pointerX > rect.width || pointerY > rect.height) {
        setMagnifierState(s => ({ ...s, show: false })); return;
    }

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const actualX = pointerX * scaleX;
    const actualY = pointerY * scaleY;

    const zoom = 3; 
    const size = 120;
    const bgX = -((actualX * zoom) - (size / 2));
    const bgY = -((actualY * zoom) - (size / 2));

    setMagnifierState({
      show: true, x: pointerX - (size / 2), y: pointerY - size - 30,
      bgX, bgY, bgWidth: canvas.width * zoom, bgHeight: canvas.height * zoom
    });
  };

  // 輔助函數：渲染加減按鈕
  const renderChannelControl = (label: string, settingKey: keyof Settings, color: string) => {
    const value = settings[settingKey];
    
    const update = (delta: number) => {
      setSettings(prev => ({ ...prev, [settingKey]: prev[settingKey] + delta }));
    };

    return (
      <div style={{
        flex: 1,              
        minWidth: 0,          
        margin: '0 2px'       
      }}>
        <div style={{
          color: color, 
          fontSize:'0.75rem', 
          fontWeight:'bold', 
          marginBottom:'2px', 
          textAlign:'center'
        }}>
          {label}
        </div>

        <div style={{
          display:'flex', 
          alignItems:'center', 
          background:'#333',     
          borderRadius:'6px',    
          overflow: 'hidden'     
        }}>
          <button 
            style={{
              flex: 1,           
              padding:'8px 0',   
              background:'transparent', 
              color:'#fff', 
              fontSize:'1.1rem',
              lineHeight: 1,
              cursor: 'pointer',
              minWidth: '25px'   
            }}
            onClick={() => update(-1)}
          >-</button>
          
          <span style={{
            flex: 1,             
            textAlign:'center', 
            fontSize:'0.85rem',  
            color:'#fff',
            fontFamily: 'monospace', 
            userSelect: 'none'
          }}>{value}</span>
          
          <button 
            style={{
              flex: 1,
              padding:'8px 0',
              background:'transparent', 
              color:'#fff', 
              fontSize:'1.1rem',
              lineHeight: 1,
              cursor: 'pointer',
              minWidth: '25px'
            }}
            onClick={() => update(1)}
          >+</button>
        </div>
      </div>
    );
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPickingBase || !originalDataRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);

    const index = (y * canvas.width + x) * 4;
    const data = originalDataRef.current.data;

    if (data[index] !== undefined) {
      setBaseColor({ r: data[index], g: data[index+1], b: data[index+2] });
      setIsPickingBase(false);
      setMagnifierState(s => ({ ...s, show: false }));
    }
  };

  const resetBase = () => {
    setBaseColor(defaultBaseColor);
    setBaseExposure(1.1);
    setIsPickingBase(false);
  };

  const resetSettings = () => {
    setSettings({ 
      brightness: 1.0, 
      contrast: 1.1, 
      rShadow: 0, gShadow: 0, bShadow: 0, 
      rHigh: 0, gHigh: 0, bHigh: 0, 
      rMid: 0, gMid: 0, bMid: 0,
    });
  };

  const handleSave = () => {
    if (!canvasRef.current) return;
    
    // 建立暫時畫布以繪製浮水印
    const saveCanvas = document.createElement('canvas');
    const saveCtx = saveCanvas.getContext('2d');
    
    // 檢查 saveCtx 是否存在 (解決 saveCtx possibly null 錯誤)
    if (!saveCtx) return;

    const sourceCanvas = canvasRef.current;
    saveCanvas.width = sourceCanvas.width;
    saveCanvas.height = sourceCanvas.height;

    saveCtx.drawImage(sourceCanvas, 0, 0);

    // --- 開始繪製浮水印 ---

    // ============ 🛠️ 自定義參數區 (修改這裡) 🛠️ ============
    
    // [A] 透明度 (Opacity)
    // 範圍：0.0 (全透明) 到 1.0 (實色)
    // 建議：0.5 - 0.8 之間比較適合浮水印
    const opacity = 0.5; 

    // [B] 字體樣式 (Font Family & Style)
    // 你可以改成 'Times New Roman', 'Courier New' 等
    const fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    const fontStyle = 'bold'; // 可選 'normal', 'italic', 'bold'

    // [C] 字體大小比例 (Size Scale)
    // 0.035 代表字高佔畫面總高度的 3.5%。
    // 想字大啲就改做 0.05，細啲就 0.025
    const sizeScaleFactor = 0.035;

    // [D] 文字內容 (分兩行定義)
    const line1Text = "Filter by:";
    const line2Text = "Megatoni Production";

    // =====================================================

    // 計算實際參數
    // 保持動態大小，確保大圖細圖比例一致
    const fontSize = Math.max(20, Math.floor(saveCanvas.height * sizeScaleFactor));
    // 計算行高 (Line Height)，通常設為字體的 1.2 倍左右，讓兩行之間有呼吸位
    const lineHeight = fontSize * 1.2;

    // 設定畫筆
    saveCtx.font = `${fontStyle} ${fontSize}px ${fontFamily}`;
    // 使用模板字符串插入上面設定的 opacity
    saveCtx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
    saveCtx.textAlign = 'right';    // 對齊右邊
    saveCtx.textBaseline = 'bottom'; // 對齊底部基準線

    // 加入陰影 (增加清晰度，數值可不改)
    saveCtx.shadowColor = 'rgba(0, 0, 0, 0.8)'; // 陰影深色一點配合透明文字
    saveCtx.shadowBlur = 4;
    saveCtx.shadowOffsetX = 2;
    saveCtx.shadowOffsetY = 2;

    // 計算位置
    const padding = Math.floor(fontSize / 1.5); // 邊距
    const x = saveCanvas.width - padding;
    // y 是「最底那一行」的底部位置
    const y = saveCanvas.height - padding;

    // --- 分兩次繪製 (解決不支援換行問題) ---
    
    // 1. 先畫第二行 (最底果行：Megatoni Production)
    // 位置在基準點 y
    saveCtx.fillText(line2Text, x, y);
    
    // 2. 再畫第一行 (上面果行：Filter by:)
    // 位置要向上移一個行高 (y - lineHeight)
    saveCtx.fillText(line1Text, x, y - lineHeight);

    // --- 觸發下載 ---
    const link = document.createElement('a');
    link.download = `Megatoni-Film-${Date.now()}.jpg`;
    link.href = saveCanvas.toDataURL('image/jpeg', 0.92);
    link.click();
  };

  const handleSlider = (key: keyof Settings, val: string) => {
    setSettings(prev => ({ ...prev, [key]: parseFloat(val) }));
  };

  return (
    <div className="container">
      <h1>🎞️ 菲林預覽室</h1>

      <div className="btn-group">
        <div className="upload-btn-wrapper">
          <button className="primary">📸 拍攝 / 上載</button>
          <input type="file" accept="image/*" capture="environment" onChange={handleImageUpload} />
        </div>
        <button className="success" onClick={handleSave} disabled={!imageLoaded}>💾 儲存</button>
      </div>

      <div className="btn-group">
         <button 
           className={`secondary ${isPickingBase ? 'active' : ''}`}
           onClick={() => setIsPickingBase(!isPickingBase)}
           disabled={!imageLoaded}
           style={{flex: 2}}
         >
           {isPickingBase ? '👆 請按住畫面選取' : '🎨 1. 校正片基'}
         </button>
         <button className="secondary" onClick={resetBase} disabled={!imageLoaded}>↩️ 還原片基</button>
      </div>

      <div className="canvas-wrapper">
        <canvas 
          ref={canvasRef}
          onPointerDown={handlePointerMove}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={() => setMagnifierState(s => ({...s, show: false}))}
        />
        
        {!imageLoaded && <div className="hint">請先拍攝燈箱上的負片</div>}

        {isPickingBase && magnifierState.show && (
          <div className="magnifier" style={{
            top: magnifierState.y, left: magnifierState.x,
            width: '120px', height: '120px',
            backgroundImage: `url(${previewUrlRef.current})`,
            backgroundSize: `${magnifierState.bgWidth}px ${magnifierState.bgHeight}px`,
            backgroundPosition: `${magnifierState.bgX}px ${magnifierState.bgY}px`,
            position: 'absolute', borderRadius: '50%', border: '3px solid #fff',
            boxShadow: '0 4px 10px rgba(0,0,0,0.5)', pointerEvents: 'none', zIndex: 100
          }}>
             <div style={{
               position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
               width: '14px', height: '14px', pointerEvents: 'none'
            }}>
               <div style={{position:'absolute', top:'6px', left:'0', width:'14px', height:'2px', background:'red'}}></div>
               <div style={{position:'absolute', top:'0', left:'6px', width:'2px', height:'14px', background:'red'}}></div>
            </div>
          </div>
        )}
      </div>

      {imageLoaded && (
        <div className="controls">
          <div className="control-group" style={{background: '#333', padding: '10px', borderRadius: '8px', marginBottom: '15px'}}>
            <label style={{color: '#ffcc00'}}>🔦 掃描曝光</label>
            <input type="range" min="0.5" max="3.0" step="0.1" 
              value={baseExposure} 
              onChange={e => setBaseExposure(parseFloat(e.target.value))} 
            />
          </div>

          <div className="control-group">
            <label>☀️ 整體亮度</label>
            <input type="range" min="0.5" max="2.0" step="0.05" value={settings.brightness} onChange={e => handleSlider('brightness', e.target.value)} />
          </div>
          <div className="control-group">
            <label>◐ 對比度</label>
            <input type="range" min="0.5" max="2.0" step="0.05" value={settings.contrast} onChange={e => handleSlider('contrast', e.target.value)} />
          </div>
          
          <hr style={{borderColor:'#444', margin:'15px 0'}}/>

          {/* 1. 黑位 (Shadows) */}
          <div className="control-group">
            <label style={{color: '#aaa', fontSize:'0.9em', borderLeft:'3px solid #666', paddingLeft:'5px'}}>⚫ 黑位 (Shadows)</label>
            <div style={{display:'flex', gap:'3px', marginTop:'5px'}}>
              {renderChannelControl("R", "rShadow", "#ff6666")}
              {renderChannelControl("G", "gShadow", "#66ff66")}
              {renderChannelControl("B", "bShadow", "#6666ff")}
            </div>
          </div>

          {/* 2. 中光位 (Midtones) */}
          <div className="control-group" style={{marginTop:'15px'}}>
            <label style={{color: '#ccc', fontSize:'0.9em', borderLeft:'3px solid #999', paddingLeft:'5px'}}>🌗 整體平衡 (Midtones)</label>
            <div style={{display:'flex', gap:'3px', marginTop:'5px'}}>
              {renderChannelControl("R", "rMid", "#ff6666")}
              {renderChannelControl("G", "gMid", "#66ff66")}
              {renderChannelControl("B", "bMid", "#6666ff")}
            </div>
          </div>

          {/* 3. 高光位 (Highlights) */}
          <div className="control-group" style={{marginTop:'15px'}}>
            <label style={{color: '#fff', fontSize:'0.9em', borderLeft:'3px solid #fff', paddingLeft:'5px'}}>⚪ 高光 (Highlights)</label>
            <div style={{display:'flex', gap:'3px', marginTop:'5px'}}>
              {renderChannelControl("R", "rHigh", "#ff6666")}
              {renderChannelControl("G", "gHigh", "#66ff66")}
              {renderChannelControl("B", "bHigh", "#6666ff")}
            </div>
          </div>

          <div className="control-group" style={{textAlign:'center', marginTop: '20px'}}>
             <button className="secondary" onClick={resetSettings}>🔄 重置調色參數</button>
          </div>
        </div>
      )}
    </div>
  );
}