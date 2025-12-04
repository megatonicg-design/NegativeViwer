import React, { useState, useRef, useEffect } from 'react';
import './App.css';

// 定義設定的介面 (Interface)
interface Settings {
  brightness: number;
  contrast: number;
  rBal: number;
  gBal: number;
  bBal: number;
}

export default function App() {
  // 狀態管理
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);
  const [isPickingBase, setIsPickingBase] = useState<boolean>(false);
  const [baseColor, setBaseColor] = useState({ r: 255, g: 180, b: 140 });

  // 色彩調整參數
  const [settings, setSettings] = useState<Settings>({
    brightness: 1.0,
    contrast: 1.1,
    rBal: 0,
    gBal: 0,
    bBal: 0,
  });

  // 引用 Canvas 和 原始圖片數據
  // TypeScript 需要知道 Ref 參考的是 HTMLCanvasElement
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 原始數據可能是 ImageData 或者 null
  const originalDataRef = useRef<ImageData | null>(null);

  // 當任何參數改變時，重新繪製圖片
  useEffect(() => {
    if (imageLoaded) {
      processImage();
    }
  }, [baseColor, settings, imageLoaded]);

  // 1. 處理圖片上載
  // 指定 e 的類型為 React 的 Input 變更事件
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; // 使用 ?. 避免錯誤
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        // 確保 canvas 存在
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // 限制圖片大小以提升效能
        const maxWidth = 800;
        const scale = Math.min(1, maxWidth / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        // 繪製原圖
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // 儲存原始數據
        originalDataRef.current = ctx.getImageData(
          0,
          0,
          canvas.width,
          canvas.height
        );

        setImageLoaded(true);
        resetSettings();
      };
      
      // 強制斷言 result 是 string (因為我們是 readAsDataURL)
      if (event.target?.result) {
          img.src = event.target.result as string;
      }
    };
    reader.readAsDataURL(file);
  };

  // 2. 核心演算法：負片轉正片
  const processImage = () => {
    const canvas = canvasRef.current;
    // 嚴格檢查：如果沒有 canvas 或沒有原始數據，就不執行
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

      // --- A: 去色罩 ---
      r = baseR > 0 ? (r / baseR) * 255 : r;
      g = baseG > 0 ? (g / baseG) * 255 : g;
      b = baseB > 0 ? (b / baseB) * 255 : b;

      // --- B: 反轉色彩 ---
      r = 255 - r;
      g = 255 - g;
      b = 255 - b;

      // --- C: 色彩平衡 ---
      r += rBal;
      g += gBal;
      b += bBal;

      // --- D: 亮度與對比度 ---
      r *= brightness;
      g *= brightness;
      b *= brightness;

      r = contrast * (r - 128) + 128;
      g = contrast * (g - 128) + 128;
      b = contrast * (b - 128) + 128;

      dest[i] = r;
      dest[i + 1] = g;
      dest[i + 2] = b;
      dest[i + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
  };

  // 3. 點擊畫面選取片基顏色
  // 指定 e 為滑鼠事件
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // 檢查 originalDataRef.current 是否存在
    if (!isPickingBase || !originalDataRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) * (canvas.width / rect.width));
    const y = Math.floor(
      (e.clientY - rect.top) * (canvas.height / rect.height)
    );

    // 不需要再拿 ctx，直接讀原始數據
    const index = (y * canvas.width + x) * 4;
    const data = originalDataRef.current.data;

    // 安全檢查：確保點擊位置在數據範圍內
    if (index >= 0 && index < data.length) {
        setBaseColor({
        r: data[index],
        g: data[index + 1],
        b: data[index + 2],
        });
        setIsPickingBase(false);
    }
  };

  const resetSettings = () => {
    setSettings({
      brightness: 1.1,
      contrast: 1.2,
      rBal: 0,
      gBal: 0,
      bBal: 0,
    });
  };

  // 指定 name 為 keyof Settings (確保只能傳入設定裡有的 key)
  const handleSliderChange = (name: keyof Settings, value: string) => {
    setSettings((prev) => ({ ...prev, [name]: parseFloat(value) }));
  };

  return (
    <div className="container">
      <h1>🎞️ 菲林沖洗預覽室</h1>

      {/* 按鈕區 */}
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
      </div>

      <div className="btn-group">
        <button
          className={`secondary ${isPickingBase ? 'active' : ''}`}
          onClick={() => setIsPickingBase(!isPickingBase)}
          disabled={!imageLoaded}
        >
          {isPickingBase ? '👇 請點擊畫面橙色邊緣' : '🎨 1. 校正片基 (去色罩)'}
        </button>
        <button
          className="secondary"
          onClick={resetSettings}
          disabled={!imageLoaded}
        >
          🔄 重置
        </button>
      </div>

      {/* 畫布區 */}
      <div className="canvas-wrapper">
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          style={{ cursor: isPickingBase ? 'crosshair' : 'default' }}
        />
        {!imageLoaded && <div className="hint">請先上載負片照片</div>}
      </div>

      {/* 控制滑桿區 */}
      {imageLoaded && (
        <div className="controls">
          <div className="control-group">
            <label>
              <span>☀️ 亮度</span>{' '}
              <span>{Math.round(settings.brightness * 100)}%</span>
            </label>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              value={settings.brightness}
              onChange={(e) => handleSliderChange('brightness', e.target.value)}
            />
          </div>

          <div className="control-group">
            <label>
              <span>◐ 對比度</span>{' '}
              <span>{Math.round(settings.contrast * 100)}%</span>
            </label>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              value={settings.contrast}
              onChange={(e) => handleSliderChange('contrast', e.target.value)}
            />
          </div>

          <hr style={{ borderColor: '#444', margin: '20px 0' }} />

          <div className="control-group">
            <label>
              <span style={{ color: '#ff5555' }}>R 紅色平衡 (青/紅)</span>
            </label>
            <input
              type="range"
              min="-100"
              max="100"
              step="5"
              value={settings.rBal}
              onChange={(e) => handleSliderChange('rBal', e.target.value)}
            />
          </div>

          <div className="control-group">
            <label>
              <span style={{ color: '#55ff55' }}>G 綠色平衡 (洋紅/綠)</span>
            </label>
            <input
              type="range"
              min="-100"
              max="100"
              step="5"
              value={settings.gBal}
              onChange={(e) => handleSliderChange('gBal', e.target.value)}
            />
          </div>

          <div className="control-group">
            <label>
              <span style={{ color: '#5555ff' }}>B 藍色平衡 (黃/藍)</span>
            </label>
            <input
              type="range"
              min="-100"
              max="100"
              step="5"
              value={settings.bBal}
              onChange={(e) => handleSliderChange('bBal', e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  );
}