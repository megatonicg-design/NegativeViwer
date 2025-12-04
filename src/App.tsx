import React, { useState, useRef, useEffect } from 'react';
import './App.css';

// --- 定義類型介面 (Interfaces) ---
// 這些告訴 TypeScript 我們的物件長什麼樣子
interface RGB {
  r: number;
  g: number;
  b: number;
}

interface Settings {
  brightness: number;
  contrast: number;
  rBal: number;
  gBal: number;
  bBal: number;
}

interface MagnifierState {
  show: boolean;
  x: number;
  y: number;
  bgX: number;
  bgY: number;
  bgWidth: number;
  bgHeight: number;
}

export default function App() {
  // --- 狀態管理 ---
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);
  const [isPickingBase, setIsPickingBase] = useState<boolean>(false);
  
  // 預設片基顏色
  const [baseColor, setBaseColor] = useState<RGB>({ r: 230, g: 160, b: 130 }); 
  
  // 調色參數
  const [settings, setSettings] = useState<Settings>({
    brightness: 1.0,
    contrast: 1.1,
    rBal: 0, gBal: 0, bBal: 0
  });

  // 放大鏡狀態
  const [magnifierState, setMagnifierState] = useState<MagnifierState>({
    show: false,
    x: 0, y: 0,
    bgX: 0, bgY: 0,
    bgWidth: 0, bgHeight: 0
  });

  // --- Refs (修正重點：加上明確的 HTML 類型) ---
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const originalDataRef = useRef<ImageData | null>(null); 
  const previewUrlRef = useRef<string>('');

  // 監聽參數變化 -> 重新處理圖片
  useEffect(() => {
    if (imageLoaded) {
      processImage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseColor, settings, imageLoaded]);

  // --- 1. 圖片上載/拍攝處理 ---
  // 修正：為事件 e 加上類型 React.ChangeEvent
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const file = files[0];
    const reader = new FileReader();
    
    reader.onload = (event: ProgressEvent<FileReader>) => {
      // 修正：檢查 result 是否存在且為字串
      const result = event.target?.result;
      if (typeof result === 'string') {
        const img = new Image();
        img.onload = () => {
          const canvas = canvasRef.current;
          // 修正：檢查 canvas 是否為 null
          if (!canvas) return;

          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          
          const maxWidth = 1000; 
          const scale = Math.min(1, maxWidth / img.width);
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;

          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          
          // 修正：加上類型斷言或確保不為 null
          originalDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
          
          setImageLoaded(true);
          setIsPickingBase(false);
          resetSettings();
          
          setTimeout(processImage, 50);
        };
        img.src = result;
      }
    };
    reader.readAsDataURL(file);
  };

  // --- 2. 核心影像處理 ---
  const processImage = () => {
    // 修正：嚴格檢查 Ref 是否存在
    if (!originalDataRef.current || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const width = originalDataRef.current.width;
    const height = originalDataRef.current.height;
    
    // 複製數據以避免修改原圖
    const newData = new ImageData(
      new Uint8ClampedArray(originalDataRef.current.data),
      width,
      height
    );
    const data = newData.data;

    const { r: baseR, g: baseG, b: baseB } = baseColor;
    const { brightness, contrast, rBal, gBal, bBal } = settings;

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i+1];
      let b = data[i+2];

      // A. 去色罩
      r = baseR > 10 ? (r / baseR) * 255 : r;
      g = baseG > 10 ? (g / baseG) * 255 : g;
      b = baseB > 10 ? (b / baseB) * 255 : b;

      // B. 反轉
      r = 255 - r;
      g = 255 - g;
      b = 255 - b;

      // C. RGB 平衡
      r += rBal; g += gBal; b += bBal;

      // D. 亮度
      r *= brightness; g *= brightness; b *= brightness;

      // E. 對比度
      r = contrast * (r - 128) + 128;
      g = contrast * (g - 128) + 128;
      b = contrast * (b - 128) + 128;

      data[i] = r;
      data[i+1] = g;
      data[i+2] = b;
    }

    ctx.putImageData(newData, 0, 0);
    previewUrlRef.current = canvas.toDataURL(); 
  };

  // --- 3. 放大鏡座標計算 ---
  // 修正：使用 React.PointerEvent 類型
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPickingBase || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    const pointerX = e.clientX - rect.left;
    const pointerY = e.clientY - rect.top;

    if (pointerX < 0 || pointerY < 0 || pointerX > rect.width || pointerY > rect.height) {
        setMagnifierState(s => ({ ...s, show: false }));
        return;
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
      show: true,
      x: pointerX - (size / 2),     
      y: pointerY - size - 30,      
      bgX, bgY,
      bgWidth: canvas.width * zoom,
      bgHeight: canvas.height * zoom
    });
  };

  // --- 4. 點擊選取顏色 ---
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

    // 確保有數據才讀取
    if (data && data[index] !== undefined) {
      setBaseColor({ r: data[index], g: data[index+1], b: data[index+2] });
      setIsPickingBase(false); 
      setMagnifierState(s => ({ ...s, show: false }));
    }
  };

  const handleSave = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `film-preview-${Date.now()}.jpg`;
    link.href = canvasRef.current.toDataURL('image/jpeg', 0.9);
    link.click();
  };

  const resetSettings = () => {
    setSettings({ brightness: 1.0, contrast: 1.1, rBal: 0, gBal: 0, bBal: 0 });
  };

  // 修正：明確指定 key 為 Settings 的 key
  const handleSlider = (key: keyof Settings, val: string) => {
    setSettings(prev => ({ ...prev, [key]: parseFloat(val) }));
  };

  return (
    <div className="container">
      <h1>🎞️ 菲林預覽室 (TS 版)</h1>

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
         >
           {isPickingBase ? '👆 請按住畫面選取橙色邊緣' : '🎨 1. 校正片基 (去色罩)'}
         </button>
         <button className="secondary" onClick={resetSettings} disabled={!imageLoaded}>🔄 重置</button>
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

        {/* 放大鏡組件 */}
        {isPickingBase && magnifierState.show && (
          <div className="magnifier" style={{
            top: magnifierState.y,
            left: magnifierState.x,
            width: '120px',
            height: '120px',
            backgroundImage: `url(${previewUrlRef.current})`,
            backgroundSize: `${magnifierState.bgWidth}px ${magnifierState.bgHeight}px`,
            backgroundPosition: `${magnifierState.bgX}px ${magnifierState.bgY}px`,
            position: 'absolute',
            borderRadius: '50%',
            border: '3px solid #fff',
            boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
            pointerEvents: 'none',
            zIndex: 100,
            overflow: 'hidden'
          }}>
            <div style={{
               position: 'absolute', top: '50%', left: '50%', 
               width: '14px', height: '14px',
               transform: 'translate(-50%, -50%)',
               pointerEvents: 'none'
            }}>
               <div style={{position:'absolute', top:'6px', left:'0', width:'14px', height:'2px', background:'red'}}></div>
               <div style={{position:'absolute', top:'0', left:'6px', width:'2px', height:'14px', background:'red'}}></div>
            </div>
          </div>
        )}
      </div>

      {imageLoaded && (
        <div className="controls">
          <div className="control-group">
            <label>☀️ 亮度</label>
            <input type="range" min="0.5" max="2.5" step="0.05" value={settings.brightness} onChange={e => handleSlider('brightness', e.target.value)} />
          </div>
          <div className="control-group">
            <label>◐ 對比度</label>
            <input type="range" min="0.5" max="2.0" step="0.05" value={settings.contrast} onChange={e => handleSlider('contrast', e.target.value)} />
          </div>
          
          <hr style={{borderColor:'#444', margin:'15px 0'}}/>

          <div className="control-group">
            <label style={{color:'#ff6666'}}>R 紅色平衡</label>
            <input type="range" min="-100" max="100" step="2" value={settings.rBal} onChange={e => handleSlider('rBal', e.target.value)} />
          </div>
          <div className="control-group">
            <label style={{color:'#66ff66'}}>G 綠色平衡</label>
            <input type="range" min="-100" max="100" step="2" value={settings.gBal} onChange={e => handleSlider('gBal', e.target.value)} />
          </div>
          <div className="control-group">
            <label style={{color:'#6666ff'}}>B 藍色平衡</label>
            <input type="range" min="-100" max="100" step="2" value={settings.bBal} onChange={e => handleSlider('bBal', e.target.value)} />
          </div>
        </div>
      )}
    </div>
  );
}