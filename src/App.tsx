import React, { useState, useRef, useEffect, useCallback } from 'react';
import './App.css';

// --- 1. 定義類型接口 (Type Definitions) ---
interface Settings {
  brightness: number;
  contrast: number;
  rBal: number;
  gBal: number;
  bBal: number;
}

interface RGB {
  r: number;
  g: number;
  b: number;
}

interface MagnifierState {
  show: boolean;
  x: number;
  y: number;
  bgX: number;
  bgY: number;
  zoomLevel: number;
  bgWidth: number;
  bgHeight: number;
}

export default function App() {
  // --- 狀態管理 ---
  const [mode, setMode] = useState<'idle' | 'live' | 'frozen'>('idle');
  const [isPickingBase, setIsPickingBase] = useState<boolean>(false);
  
  // 預設片基與參數
  const [baseColor, setBaseColor] = useState<RGB>({ r: 230, g: 160, b: 130 }); 
  const [settings, setSettings] = useState<Settings>({
    brightness: 1.0, contrast: 1.1, rBal: 0, gBal: 0, bBal: 0
  });

  // 放大鏡狀態
  const [magnifierState, setMagnifierState] = useState<MagnifierState>({ 
    show: false, x: 0, y: 0, bgX: 0, bgY: 0, zoomLevel: 4, bgWidth: 0, bgHeight: 0
  });

  // --- Refs ---
  const videoRef = useRef<HTMLVideoElement>(null);      
  const canvasRef = useRef<HTMLCanvasElement>(null);     
  const requestRef = useRef<number | null>(null);    
  const streamRef = useRef<MediaStream | null>(null);     
  const originalDataRef = useRef<ImageData | null>(null); 

  // --- 2. 像素處理邏輯 ---
  const processPixels = (data: Uint8ClampedArray, base: RGB, set: Settings) => {
    const { r: baseR, g: baseG, b: baseB } = base;
    const { brightness, contrast, rBal, gBal, bBal } = set;
    
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      // 去色罩
      r = baseR > 10 ? (r / baseR) * 255 : r;
      g = baseG > 10 ? (g / baseG) * 255 : g;
      b = baseB > 10 ? (b / baseB) * 255 : b;

      // 反轉
      r = 255 - r;
      g = 255 - g;
      b = 255 - b;

      // 平衡
      r += rBal; g += gBal; b += bBal;

      // 亮度
      r *= brightness; g *= brightness; b *= brightness;

      // 對比度
      r = contrast * (r - 128) + 128;
      g = contrast * (g - 128) + 128;
      b = contrast * (b - 128) + 128;

      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  };

  // --- 3. 靜態圖片重繪 ---
  const reprocessStaticImage = useCallback(() => {
    if (mode !== 'frozen' || !originalDataRef.current || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const newData = new ImageData(
        new Uint8ClampedArray(originalDataRef.current.data),
        originalDataRef.current.width,
        originalDataRef.current.height
    );
    
    processPixels(newData.data, baseColor, settings);
    ctx.putImageData(newData, 0, 0);
  }, [baseColor, settings, mode]);

  // --- 4. 核心循環 ---
  const renderLoop = () => {
    if (mode === 'frozen') return; 

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (video && video.readyState === 4 && canvas) {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      ctx.drawImage(video, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      processPixels(imageData.data, baseColor, settings);
      ctx.putImageData(imageData, 0, 0);
    }

    requestRef.current = requestAnimationFrame(renderLoop);
  };

  // --- 5. 啟動攝像頭 ---
  const startCamera = async () => {
    try {
      if (!videoRef.current) return;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 }, 
          height: { ideal: 720 }
        },
        audio: false
      });

      videoRef.current.srcObject = stream;
      videoRef.current.play();
      streamRef.current = stream;
      setMode('live');
      
      requestRef.current = requestAnimationFrame(renderLoop);
    } catch (err) {
      console.error("Error accessing camera:", err);
      alert("無法啟動相機，請檢查權限或使用 HTTPS。");
    }
  };

  // --- 6. 停止攝像頭 ---
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      streamRef.current = null;
    }
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
    }
  };

  // --- 7. 凍結畫面 (拍照) ---
  const freezeImage = () => {
    setMode('frozen');
    stopCamera(); 
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    if (videoRef.current) {
        ctx.drawImage(videoRef.current, 0, 0);
        originalDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
        reprocessStaticImage(); 
    }
  };

  useEffect(() => {
    if (mode === 'frozen') {
      reprocessStaticImage();
    }
  }, [baseColor, settings, mode, reprocessStaticImage]);

  useEffect(() => {
    return () => stopCamera();
  }, []);

  // --- 觸控與放大鏡邏輯 ---
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if ((!isPickingBase && mode !== 'frozen') || !canvasRef.current) return;

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
    const magSize = 120; 

    const bgWidth = canvas.width * zoom;
    const bgHeight = canvas.height * zoom;

    const bgPosX = -((actualX * zoom) - (magSize / 2));
    const bgPosY = -((actualY * zoom) - (magSize / 2));

    setMagnifierState({
      show: true,
      x: pointerX - (magSize / 2), 
      y: pointerY - magSize - 20, 
      bgWidth: bgWidth,
      bgHeight: bgHeight,
      bgX: bgPosX,
      bgY: bgPosY,
      zoomLevel: zoom // [修正] 這裡加上了 zoomLevel，錯誤消失
    });
  };

  const handleCanvasClick = (e: React.PointerEvent<HTMLCanvasElement>) => {
     if (!isPickingBase || mode !== 'frozen' || !originalDataRef.current || !canvasRef.current) return;
     
     const canvas = canvasRef.current;
     const rect = canvas.getBoundingClientRect();
     const x = Math.floor((e.clientX - rect.left) * (canvas.width / rect.width));
     const y = Math.floor((e.clientY - rect.top) * (canvas.height / rect.height));
     
     const index = (y * canvas.width + x) * 4;
     const data = originalDataRef.current.data;

     if (data[index] !== undefined) {
         setBaseColor({ r: data[index], g: data[index + 1], b: data[index + 2] });
         setIsPickingBase(false);
         setMagnifierState(s => ({...s, show: false}));
     }
  };

  const handleSave = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `film-scan-${Date.now()}.png`;
    link.href = canvasRef.current.toDataURL();
    link.click();
  };

  const resetParams = () => setSettings({ brightness: 1.0, contrast: 1.1, rBal: 0, gBal: 0, bBal: 0 });

  return (
    <div className="container">
      <video ref={videoRef} style={{ display: 'none' }} playsInline muted autoPlay></video>

      <h1>🎞️ 菲林 AR 預覽器</h1>

      <div className="btn-group">
        {mode === 'idle' && (
            <button className="primary" onClick={startCamera}>🔴 啟動相機 (Live)</button>
        )}
        
        {mode === 'live' && (
            <button className="active" onClick={freezeImage}>⏸ 凍結 / 拍照</button>
        )}

        {mode === 'frozen' && (
            <>
                <button className="secondary" onClick={startCamera}>🎥 重開相機</button>
                <button className="success" onClick={handleSave}>💾 儲存</button>
            </>
        )}
      </div>

      <div className="canvas-wrapper">
        <canvas 
            ref={canvasRef}
            onPointerDown={handlePointerMove}
            onPointerMove={handlePointerMove}
            onPointerUp={handleCanvasClick}
            onPointerLeave={() => setMagnifierState(s => ({...s, show: false}))}
        />
        
        {mode === 'idle' && <div className="hint">點擊上方按鈕啟動相機</div>}
        {mode === 'live' && <div className="hint">實時預覽中... 點擊「凍結」以進行校色</div>}
        
        {(isPickingBase || mode === 'frozen') && magnifierState.show && (
            <div className="magnifier" style={{
                top: magnifierState.y,
                left: magnifierState.x,
                width: '120px', 
                height: '120px',
                backgroundImage: `url(${canvasRef.current?.toDataURL()})`,
                backgroundSize: `${magnifierState.bgWidth}px ${magnifierState.bgHeight}px`,
                backgroundPosition: `${magnifierState.bgX}px ${magnifierState.bgY}px`,
                position: 'absolute',
                borderRadius: '50%',
                border: '3px solid #fff',
                boxShadow: '0 0 10px rgba(0,0,0,0.5)',
                pointerEvents: 'none',
                zIndex: 100
            }}>
              <div style={{
                position: 'absolute', top: '50%', left: '50%', 
                transform: 'translate(-50%, -50%)',
                width: '10px', height: '10px',
                borderTop: '2px solid red', borderLeft: '2px solid red',
                opacity: 0.8
              }}></div>
            </div>
        )}
      </div>

      <div className="controls">
         {mode === 'frozen' && (
            <div className="control-group">
                <button 
                    className={`secondary ${isPickingBase ? 'active' : ''}`}
                    onClick={() => setIsPickingBase(!isPickingBase)}
                    style={{width:'100%', marginBottom: '15px'}}
                >
                {isPickingBase ? '👆 請點擊橙色片基' : '🎨 1. 校正片基 (建議先凍結)'}
                </button>
            </div>
         )}

         <div className="control-group">
            <label><span>☀️ 亮度</span> <span>{Math.round(settings.brightness * 100)}%</span></label>
            <input type="range" min="0.5" max="2.5" step="0.1" value={settings.brightness} onChange={e => setSettings({...settings, brightness: parseFloat(e.target.value)})} />
         </div>

         <div className="control-group">
            <label><span>◐ 對比度</span> <span>{Math.round(settings.contrast * 100)}%</span></label>
            <input type="range" min="0.5" max="2.5" step="0.1" value={settings.contrast} onChange={e => setSettings({...settings, contrast: parseFloat(e.target.value)})} />
         </div>

          <div className="control-group" style={{marginTop:'15px'}}>
            <label style={{color:'#ff5555'}}>R 平衡</label>
            <input type="range" min="-80" max="80" step="2" value={settings.rBal} onChange={e => setSettings({...settings, rBal: parseFloat(e.target.value)})} />
            
            <label style={{color:'#55ff55'}}>G 平衡</label>
            <input type="range" min="-80" max="80" step="2" value={settings.gBal} onChange={e => setSettings({...settings, gBal: parseFloat(e.target.value)})} />
            
            <label style={{color:'#5555ff'}}>B 平衡</label>
            <input type="range" min="-80" max="80" step="2" value={settings.bBal} onChange={e => setSettings({...settings, bBal: parseFloat(e.target.value)})} />
          </div>

          <div className="control-group">
             <button className="secondary" onClick={resetParams}>🔄 重置參數</button>
          </div>
      </div>
    </div>
  );
}