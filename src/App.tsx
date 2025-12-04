import React, { useState, useRef, useEffect } from 'react';
import './App.css';

// 1. 定義數據類型接口 (Interfaces)
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
  zoomLevel: number; // 之前漏了這個定義
}

export default function App() {
  // --- 狀態管理 ---
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);
  const [isPickingBase, setIsPickingBase] = useState<boolean>(false);
  const [baseColor, setBaseColor] = useState<RGB>({ r: 230, g: 160, b: 130 });

  const [settings, setSettings] = useState<Settings>({
    brightness: 1.0,
    contrast: 1.1,
    rBal: 0,
    gBal: 0,
    bBal: 0,
  });

  const [magnifierState, setMagnifierState] = useState<MagnifierState>({
    show: false,
    x: 0,
    y: 0,
    bgX: 0,
    bgY: 0,
    zoomLevel: 4, // 初始值
  });

  // --- Refs (明確告訴 TypeScript 這些 Ref 是什麼元素) ---
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const originalDataRef = useRef<ImageData | null>(null);
  const canvasUrlRef = useRef<string>('');

  // 監聽參數變化重新繪圖
  useEffect(() => {
    if (imageLoaded) {
      processImage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseColor, settings, imageLoaded]);

  // --- 1. 處理圖片上載 ---
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return; // 安全檢查

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const maxWidth = 800;
        const scale = Math.min(1, maxWidth / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // 儲存原始數據
        originalDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);

        setImageLoaded(true);
        resetSettings();
        
        // 稍微延遲執行第一次處理
        setTimeout(processImage, 10);
      };

      if (event.target?.result) {
        img.src = event.target.result as string;
      }
    };
    reader.readAsDataURL(file);
  };

  // --- 2. 核心演算法 ---
  const processImage = () => {
    const canvas = canvasRef.current;
    if (!canvas || !originalDataRef.current) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    const src = originalDataRef.current.data;
    const imageData = ctx.createImageData(width, height);
    const dest = imageData.data;

    const { r: baseR, g: baseG, b: baseB } = baseColor;
    const { brightness, contrast, rBal, gBal, bBal } = settings;

    for (let i = 0; i < src.length; i += 4) {
      let r = src[i];
      let g = src[i + 1];
      let b = src[i + 2];

      // 去色罩
      r = baseR > 10 ? (r / baseR) * 255 : r;
      g = baseG > 10 ? (g / baseG) * 255 : g;
      b = baseB > 10 ? (b / baseB) * 255 : b;

      // 反轉
      r = 255 - r;
      g = 255 - g;
      b = 255 - b;

      // 色彩平衡
      r += rBal;
      g += gBal;
      b += bBal;

      // 亮度
      r *= brightness;
      g *= brightness;
      b *= brightness;

      // 對比度
      r = contrast * (r - 128) + 128;
      g = contrast * (g - 128) + 128;
      b = contrast * (b - 128) + 128;

      dest[i] = r;
      dest[i + 1] = g;
      dest[i + 2] = b;
      dest[i + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
    canvasUrlRef.current = canvas.toDataURL();
  };

  // --- 3. 處理放大鏡與觸控 ---
  // 使用 PointerEvent 可以同時支援滑鼠和觸控
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPickingBase || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    // 計算相對座標
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // 邊界檢查
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
      setMagnifierState((prev) => ({ ...prev, show: false }));
      return;
    }

    const zoomLevel = 4;
    const magnifierSize = 100;

    const bgX = (x * zoomLevel) - (magnifierSize / 2);
    const bgY = (y * zoomLevel) - (magnifierSize / 2);

    setMagnifierState({
      show: true,
      x: e.clientX - rect.left + 20,
      y: e.clientY - rect.top - 120,
      bgX: -bgX,
      bgY: -bgY,
      zoomLevel: zoomLevel
    });
  };

  const hideMagnifier = () => {
    setMagnifierState((prev) => ({ ...prev, show: false }));
  };

  // --- 4. 點擊確認選取顏色 ---
  const handleCanvasClick = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPickingBase || !originalDataRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) * (canvas.width / rect.width));
    const y = Math.floor((e.clientY - rect.top) * (canvas.height / rect.height));

    const data = originalDataRef.current.data;
    const index = (y * canvas.width + x) * 4;

    // 安全檢查：確保 index 在範圍內
    if (index >= 0 && index < data.length) {
      setBaseColor({
        r: data[index],
        g: data[index + 1],
        b: data[index + 2],
      });
      setIsPickingBase(false);
      hideMagnifier();
    }
  };

  const handleSaveImage = () => {
    if (!canvasRef.current || !imageLoaded) return;
    const link = document.createElement('a');
    link.download = `film-preview-${new Date().getTime()}.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const resetSettings = () => {
    setSettings({
      brightness: 1.0,
      contrast: 1.1,
      rBal: 0,
      gBal: 0,
      bBal: 0,
    });
  };

  // 這裡使用了 keyof Settings 確保我們只傳入正確的設定名稱
  const handleSliderChange = (name: keyof Settings, value: string) => {
    setSettings((prev) => ({ ...prev, [name]: parseFloat(value) }));
  };

  return (
    <div className="container">
      <h1>🎞️ 菲林沖洗預覽室</h1>

      {/* 上載與儲存 */}
      <div className="btn-group">
        <div className="upload-btn-wrapper">
          <button className="primary">📸 影相 / 上載</button>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleImageUpload}
          />
        </div>
        <button 
          className="success" 
          onClick={handleSaveImage} 
          disabled={!imageLoaded}
        >
            💾 儲存影像
        </button>
      </div>

      {/* 功能按鈕 */}
      <div className="btn-group">
        <button
          className={`secondary ${isPickingBase ? 'active' : ''}`}
          onClick={() => setIsPickingBase(!isPickingBase)}
          disabled={!imageLoaded}
          style={{ flex: 2 }}
        >
          {isPickingBase ? '👇 按住畫面拖動選取片基' : '🎨 1. 校正片基 (開啟放大鏡)'}
        </button>
        <button
          className="secondary"
          onClick={resetSettings}
          disabled={!imageLoaded}
        >
          🔄 重置參數
        </button>
      </div>

      {/* 畫布與放大鏡 */}
      <div className="canvas-wrapper">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerMove}
          onPointerMove={handlePointerMove}
          onPointerUp={handleCanvasClick}
          onPointerLeave={hideMagnifier}
          onPointerCancel={hideMagnifier}
        />
        
        {isPickingBase && magnifierState.show && canvasRef.current && (
          <div 
            className="magnifier"
            style={{
              top: magnifierState.y,
              left: magnifierState.x,
              backgroundImage: `url(${canvasUrlRef.current})`,
              // 這裡需要再次檢查 canvasRef.current 是否存在
              backgroundSize: `${canvasRef.current.width * magnifierState.zoomLevel}px auto`,
              backgroundPosition: `${magnifierState.bgX}px ${magnifierState.bgY}px`
            }}
          ></div>
        )}

        {!imageLoaded && <div className="hint">請先上載負片照片</div>}
      </div>

      {/* 控制滑桿區 */}
      {imageLoaded && (
        <div className="controls">
          <div className="control-group" style={{ borderBottom: '1px solid #444', paddingBottom: '15px' }}>
            <label>
              <span>☀️ 亮度</span>
              <span>{Math.round(settings.brightness * 100)}%</span>
            </label>
            <input
              type="range"
              min="0.5"
              max="2.5"
              step="0.05"
              value={settings.brightness}
              onChange={(e) => handleSliderChange('brightness', e.target.value)}
            />

            <label>
              <span>◐ 對比度</span>
              <span>{Math.round(settings.contrast * 100)}%</span>
            </label>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.05"
              value={settings.contrast}
              onChange={(e) => handleSliderChange('contrast', e.target.value)}
            />
          </div>

          <div className="control-group" style={{ marginTop: '15px' }}>
            <label style={{ color: '#ff5555' }}>R 紅色平衡 (青 ↔ 紅)</label>
            <input
              type="range"
              min="-80"
              max="80"
              step="2"
              value={settings.rBal}
              onChange={(e) => handleSliderChange('rBal', e.target.value)}
            />

            <label style={{ color: '#55ff55' }}>G 綠色平衡 (洋紅 ↔ 綠)</label>
            <input
              type="range"
              min="-80"
              max="80"
              step="2"
              value={settings.gBal}
              onChange={(e) => handleSliderChange('gBal', e.target.value)}
            />

            <label style={{ color: '#5555ff' }}>B 藍色平衡 (黃 ↔ 藍)</label>
            <input
              type="range"
              min="-80"
              max="80"
              step="2"
              value={settings.bBal}
              onChange={(e) => handleSliderChange('bBal', e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  );
}