import React, { useState, useRef, useEffect } from 'react';
import './App.css';

// 1. 定義 Settings 的型別介面 (解決 TypeScript 報錯的核心)
interface Settings {
  brightness: number;
  contrast: number;
  // 黑位 (Shadows)
  rShadow: number;
  gShadow: number;
  bShadow: number;
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

  // 調色參數 (使用上面定義的 Interface)
  const [settings, setSettings] = useState<Settings>({
    brightness: 1.0,
    contrast: 1.1,
    // 預設值
    rShadow: 0, gShadow: 0, bShadow: 0,
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
    
    // 這裡修正了解構賦值，不再使用 rBal/gBal
    const { 
      brightness, contrast, 
      rShadow, gShadow, bShadow, 
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

      // C. 分離色調處理 (Split Toning)
      
      // 黑位 (Shadows) - 加減運算
      r += rShadow;
      g += gShadow;
      b += bShadow;

      // 高光 (Highlights) - 乘法運算 (百分比)
      r *= (1 + rHigh / 100);
      g *= (1 + gHigh / 100);
      b *= (1 + bHigh / 100);

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

  // 修正了 Reset 邏輯，使用新的 key
  const resetSettings = () => {
    setSettings({ 
      brightness: 1.0, 
      contrast: 1.1, 
      rShadow: 0, gShadow: 0, bShadow: 0, 
      rHigh: 0, gHigh: 0, bHigh: 0 
    });
  };

  const handleSave = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `film-preview-${Date.now()}.jpg`;
    link.href = canvasRef.current.toDataURL('image/jpeg', 0.9);
    link.click();
  };

  // 這裡使用了 keyof Settings 確保型別安全
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

          {/* 區域 1：暗部/黑位 (Shadows) */}
          <div className="control-group">
            <label style={{fontSize: '0.9em', color: '#aaa', marginBottom:'5px'}}>⚫ 黑位修正 (Shadows)</label>
            <div style={{display:'flex', gap:'5px'}}>
              <div style={{flex:1}}>
                <label style={{color:'#ff6666', fontSize:'0.8em'}}>R</label>
                <input type="range" min="-60" max="60" step="1" value={settings.rShadow} onChange={e => handleSlider('rShadow', e.target.value)} />
              </div>
              <div style={{flex:1}}>
                <label style={{color:'#66ff66', fontSize:'0.8em'}}>G</label>
                <input type="range" min="-60" max="60" step="1" value={settings.gShadow} onChange={e => handleSlider('gShadow', e.target.value)} />
              </div>
              <div style={{flex:1}}>
                <label style={{color:'#6666ff', fontSize:'0.8em'}}>B</label>
                <input type="range" min="-60" max="60" step="1" value={settings.bShadow} onChange={e => handleSlider('bShadow', e.target.value)} />
              </div>
            </div>
          </div>

          {/* 區域 2：亮部/高光 (Highlights) */}
          <div className="control-group" style={{marginTop:'10px'}}>
            <label style={{fontSize: '0.9em', color: '#aaa', marginBottom:'5px'}}>⚪ 高光修正 (Highlights)</label>
            <div style={{display:'flex', gap:'5px'}}>
              <div style={{flex:1}}>
                <label style={{color:'#ff6666', fontSize:'0.8em'}}>R</label>
                <input type="range" min="-50" max="50" step="1" value={settings.rHigh} onChange={e => handleSlider('rHigh', e.target.value)} />
              </div>
              <div style={{flex:1}}>
                <label style={{color:'#66ff66', fontSize:'0.8em'}}>G</label>
                <input type="range" min="-50" max="50" step="1" value={settings.gHigh} onChange={e => handleSlider('gHigh', e.target.value)} />
              </div>
              <div style={{flex:1}}>
                <label style={{color:'#6666ff', fontSize:'0.8em'}}>B</label>
                <input type="range" min="-50" max="50" step="1" value={settings.bHigh} onChange={e => handleSlider('bHigh', e.target.value)} />
              </div>
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