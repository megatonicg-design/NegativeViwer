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

// 2. 獨立的濾鏡運算函數 (核心優化：抽離邏輯以供重用)
// 這個函數純粹做數學運算，不涉及 DOM 操作，可以同時服務「縮圖」和「大圖」
const applyFilters = (
  sourceData: Uint8ClampedArray, 
  width: number, 
  height: number, 
  baseColor: {r: number, g: number, b: number}, 
  baseExposure: number, 
  settings: Settings
): ImageData => {
  const newData = new Uint8ClampedArray(sourceData); // 複製數據，不破壞原圖
  const { r: baseR, g: baseG, b: baseB } = baseColor;
  const { 
    brightness, contrast, 
    rShadow, gShadow, bShadow, 
    rMid, gMid, bMid, 
    rHigh, gHigh, bHigh 
  } = settings;

  for (let i = 0; i < newData.length; i += 4) {
    let r = newData[i]; let g = newData[i+1]; let b = newData[i+2];

    // A. 去色罩 + 曝光補償
    r = baseR > 10 ? (r / baseR) * 255 * baseExposure : r;
    g = baseG > 10 ? (g / baseG) * 255 * baseExposure : g;
    b = baseB > 10 ? (b / baseB) * 255 * baseExposure : b;

    // B. 反轉
    r = 255 - r;
    g = 255 - g;
    b = 255 - b;

    // C. 分離色調處理
    r += rShadow; g += gShadow; b += bShadow;

    r *= (1 + rHigh / 100);
    g *= (1 + gHigh / 100);
    b *= (1 + bHigh / 100);

    // Math.pow 運算最耗效能，但在縮圖上跑會很快
    if (rMid !== 0) r = 255 * Math.pow(Math.max(0, r / 255), 1 / (1 + rMid / 50));
    if (gMid !== 0) g = 255 * Math.pow(Math.max(0, g / 255), 1 / (1 + gMid / 50));
    if (bMid !== 0) b = 255 * Math.pow(Math.max(0, b / 255), 1 / (1 + bMid / 50));

    // D. 亮度
    r *= brightness; g *= brightness; b *= brightness;

    // E. 對比度
    r = contrast * (r - 128) + 128;
    g = contrast * (g - 128) + 128;
    b = contrast * (b - 128) + 128;

    newData[i] = r; newData[i+1] = g; newData[i+2] = b;
  }

  return new ImageData(newData, width, height);
};

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

  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewUrlRef = useRef<string>('');
  
  // 優化重點：分開儲存「預覽縮圖」和「原始大圖」
  const previewDataRef = useRef<ImageData | null>(null); // 縮圖 (800px)
  const fullResDataRef = useRef<ImageData | null>(null); // 大圖 (原始解析度)

  // 監聽變化 -> 觸發預覽運算
  useEffect(() => {
    if (imageLoaded) processPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseColor, baseExposure, settings, imageLoaded]);

  // --- 處理圖片上載 ---
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; 
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result;
      
      if (typeof result === 'string') {
        const img = new Image();
        img.onload = () => {
          const canvas = canvasRef.current;
          if (!canvas) return;

          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          
          // --- 步驟 1: 處理大圖 (Full Res) ---
          // 建立一個隱藏的 Canvas 來獲取原始像素數據
          const fullCanvas = document.createElement('canvas');
          fullCanvas.width = img.width;
          fullCanvas.height = img.height;
          const fullCtx = fullCanvas.getContext('2d');
          if (fullCtx) {
              fullCtx.drawImage(img, 0, 0);
              // 儲存原始大圖數據到 Ref，留待 Save 時用
              fullResDataRef.current = fullCtx.getImageData(0, 0, img.width, img.height);
          }

          // --- 步驟 2: 處理縮圖 (Preview) ---
          // 限制預覽圖最大寬度為 800px (手機操作流暢的關鍵)
          const previewMaxWidth = 800; 
          const scale = Math.min(1, previewMaxWidth / img.width);
          
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;

          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          
          // 儲存縮圖數據到 Ref，用於即時運算
          previewDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
          
          // 重置狀態
          setImageLoaded(true);
          setBaseColor(defaultBaseColor);
          setBaseExposure(1.1); 
          resetSettings();
          setIsPickingBase(false);
          
          // 立即執行一次預覽
          setTimeout(processPreview, 50);
        };
        img.src = result;
      }
    };
    reader.readAsDataURL(file);
  };

  // --- 即時預覽處理 (只算縮圖) ---
  const processPreview = () => {
    // 改用 previewDataRef
    if (!previewDataRef.current || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 呼叫 helper function 處理縮圖
    const processedImageData = applyFilters(
        previewDataRef.current.data, 
        previewDataRef.current.width, 
        previewDataRef.current.height,
        baseColor, baseExposure, settings
    );

    ctx.putImageData(processedImageData, 0, 0);
    previewUrlRef.current = canvas.toDataURL(); 
  };

  // --- 放大鏡 ---
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isPickingBase) e.preventDefault();

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

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // 這裡我們從 previewDataRef 取色，因為它就是畫面上看到的
    if (!isPickingBase || !previewDataRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);

    const index = (y * canvas.width + x) * 4;
    const data = previewDataRef.current.data;

    if (data && data[index] !== undefined) {
      setBaseColor({ r: data[index], g: data[index+1], b: data[index+2] });
      setIsPickingBase(false);
      setMagnifierState(s => ({ ...s, show: false }));
    }
  };

  // --- 儲存功能 (高清 + 浮水印) ---
  const handleSave = () => {
    // 關鍵：儲存時使用 fullResDataRef (原始大圖)
    if (!fullResDataRef.current) return;

    // 1. 對高清大圖進行濾鏡運算 (這一步可能會花 1-2 秒，視乎手機效能)
    const processedFullData = applyFilters(
        fullResDataRef.current.data,
        fullResDataRef.current.width,
        fullResDataRef.current.height,
        baseColor, baseExposure, settings
    );

    // 2. 建立暫時 Canvas 進行輸出
    const saveCanvas = document.createElement('canvas');
    saveCanvas.width = fullResDataRef.current.width;
    saveCanvas.height = fullResDataRef.current.height;
    const saveCtx = saveCanvas.getContext('2d');
    if (!saveCtx) return;

    // 將處理好的大圖放上去
    saveCtx.putImageData(processedFullData, 0, 0);

    // --- 繪製浮水印 (與之前邏輯相同) ---
    const opacity = 0.05; 
    const sizeScaleFactor = 0.045; 
    const bottomPaddingScale = 0.05; 
    const fontFamily = 'Arial, Helvetica, sans-serif'; 

    const line1Text = " "; 
    const line2Text = "Megatoni Production";

    // 計算字體大小 (基於大圖寬度自動調整，所以大圖一樣清晰)
    const fontSize = Math.max(20, Math.floor(saveCanvas.width * sizeScaleFactor));
    const lineHeight = fontSize * 1.3;

    saveCtx.font = `bold ${fontSize}px ${fontFamily}`;
    saveCtx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
    saveCtx.textAlign = 'center';
    saveCtx.textBaseline = 'bottom';

    saveCtx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    saveCtx.shadowBlur = 4;
    saveCtx.shadowOffsetX = 0;
    saveCtx.shadowOffsetY = 2;

    const x = saveCanvas.width / 2;
    const paddingBottom = Math.floor(saveCanvas.width * bottomPaddingScale);
    const y = saveCanvas.height - paddingBottom;

    saveCtx.fillText(line2Text, x, y);
    saveCtx.fillText(line1Text, x, y - lineHeight);

    // 觸發下載
    const link = document.createElement('a');
    link.download = `Megatoni-Film-${Date.now()}.jpg`;
    link.href = saveCanvas.toDataURL('image/jpeg', 0.95); // 高品質 JPEG
    link.click();
  };

  // 輔助函數：渲染加減按鈕 (UI 保持不變)
  const renderChannelControl = (label: string, settingKey: keyof Settings, color: string) => {
    const value = settings[settingKey];
    const update = (delta: number) => {
      setSettings(prev => ({ ...prev, [settingKey]: prev[settingKey] + delta }));
    };

    return (
      <div style={{ flex: 1, minWidth: 0, margin: '0 2px' }}>
        <div style={{ color: color, fontSize:'0.75rem', fontWeight:'bold', marginBottom:'2px', textAlign:'center' }}>
          {label}
        </div>
        <div style={{ display:'flex', alignItems:'center', background:'#333', borderRadius:'6px', overflow: 'hidden' }}>
          <button 
            style={{ flex: 1, padding:'8px 0', background:'transparent', color:'#fff', fontSize:'1.1rem', lineHeight: 1, cursor: 'pointer', minWidth: '25px' }}
            onClick={() => update(-1)}
          >-</button>
          
          <span style={{ flex: 1, textAlign:'center', fontSize:'0.85rem', color:'#fff', fontFamily: 'monospace', userSelect: 'none' }}>
            {value}
          </span>
          
          <button 
            style={{ flex: 1, padding:'8px 0', background:'transparent', color:'#fff', fontSize:'1.1rem', lineHeight: 1, cursor: 'pointer', minWidth: '25px' }}
            onClick={() => update(1)}
          >+</button>
        </div>
      </div>
    );
  };

  const resetBase = () => {
    setBaseColor(defaultBaseColor);
    setBaseExposure(1.1);
    setIsPickingBase(false);
  };

  const resetSettings = () => {
    setSettings({ 
      brightness: 1.0, contrast: 1.1, 
      rShadow: 0, gShadow: 0, bShadow: 0, 
      rHigh: 0, gHigh: 0, bHigh: 0, 
      rMid: 0, gMid: 0, bMid: 0,
    });
  };

  const handleSlider = (key: keyof Settings, val: string) => {
    setSettings(prev => ({ ...prev, [key]: parseFloat(val) }));
  };

  return (
    <div className="container">
      <h1>🎞️ Negative Viewer 🎞️</h1>
      <h2 style={{fontSize: '0.9rem', color: '#888', marginTop: '-10px', marginBottom: '20px'}}>
        by Megatoni Production
      </h2>

      <div className="btn-group">
        <div style={{display:'flex', gap:'10px', width:'100%', justifyContent:'center'}}>
          {/* 按鈕 A: 影相 (Android 優先) */}
          <div className="upload-btn-wrapper" style={{flex:1}}>
            <button className="primary" style={{width:'100%'}}>📸 影相</button>
            <input type="file" accept="image/*" capture="environment" onChange={handleImageUpload} />
          </div>
          {/* 按鈕 B: 相簿 (iPad 優先) */}
          <div className="upload-btn-wrapper" style={{flex:1}}>
            <button className="secondary" style={{width:'100%', background:'#444'}}>🖼️ 相簿</button>
            <input type="file" accept="image/*" onChange={handleImageUpload} />
          </div>
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
           {isPickingBase ? '👆 按住選取片基' : '🎨 1. 校正片基'}
         </button>
         <button className="secondary" onClick={resetBase} disabled={!imageLoaded}>↩️ 還原</button>
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

          {/* Buy Me a Coffee 按鈕 */}
          <div className="bmc-container">
            <p style={{color: '#888', fontSize: '0.8rem', marginBottom: '10px'}}>
              覺得好用？支持開發者飲杯咖啡 ☕️
            </p>
            <a 
              className="bmc-button"
              target="_blank" 
              rel="noreferrer" 
              href="https://www.buymeacoffee.com/megatoni" 
            >
              <span className="bmc-icon">☕</span>
              Buy me a coffee
            </a>
            <p style={{color: '#555', fontSize: '0.7rem', marginTop: '10px'}}>
              Megatoni Production &copy; {new Date().getFullYear()}
            </p>
          </div>

        </div>
      )}
    </div>
  );
}