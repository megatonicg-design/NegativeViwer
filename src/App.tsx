import React, { useState, useRef, useEffect } from 'react';
import './App.css';

export default function App() {
  // 狀態管理
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isPickingBase, setIsPickingBase] = useState(false);
  const [baseColor, setBaseColor] = useState({ r: 255, g: 180, b: 140 }); // 預設底片橙色

  // 色彩調整參數
  const [settings, setSettings] = useState({
    brightness: 1.0, // 亮度
    contrast: 1.1, // 對比度
    rBal: 0, // 紅色平衡
    gBal: 0, // 綠色平衡
    bBal: 0, // 藍色平衡
  });

  // 引用 Canvas 和 原始圖片數據
  const canvasRef = useRef(null);
  const originalDataRef = useRef(null);

  // 當任何參數改變時，重新繪製圖片
  useEffect(() => {
    if (imageLoaded) {
      processImage();
    }
  }, [baseColor, settings, imageLoaded]);

  // 1. 處理圖片上載
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        // 限制圖片大小以提升效能 (手機處理大圖會慢)
        const maxWidth = 800;
        const scale = Math.min(1, maxWidth / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        // 繪製原圖
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // 儲存原始數據 (這是我們的 Source of Truth)
        originalDataRef.current = ctx.getImageData(
          0,
          0,
          canvas.width,
          canvas.height
        );

        setImageLoaded(true);
        // 上載後自動重置參數
        resetSettings();
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  // 2. 核心演算法：負片轉正片
  const processImage = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // 每次都從「原始數據」開始計算，避免重複疊加導致失真
    const src = originalDataRef.current.data;
    const imageData = ctx.createImageData(width, height);
    const dest = imageData.data;

    // 預先計算參數以提升迴圈效能
    const { r: baseR, g: baseG, b: baseB } = baseColor;
    const { brightness, contrast, rBal, gBal, bBal } = settings;

    for (let i = 0; i < src.length; i += 4) {
      let r = src[i];
      let g = src[i + 1];
      let b = src[i + 2];

      // --- 步驟 A: 去色罩 (Remove Orange Mask) ---
      // 原理：將片基顏色視為白色 (Normalize)
      // 防止除以 0
      r = baseR > 0 ? (r / baseR) * 255 : r;
      g = baseG > 0 ? (g / baseG) * 255 : g;
      b = baseB > 0 ? (b / baseB) * 255 : b;

      // --- 步驟 B: 反轉色彩 (Invert) ---
      r = 255 - r;
      g = 255 - g;
      b = 255 - b;

      // --- 步驟 C: 色彩平衡微調 (RGB Slider) ---
      // 這裡簡單地加上使用者調整的偏移量
      r += rBal;
      g += gBal;
      b += bBal;

      // --- 步驟 D: 亮度與對比度 ---
      // 亮度 (Brightness)
      r *= brightness;
      g *= brightness;
      b *= brightness;

      // 對比度 (Contrast) - 公式：factor * (color - 128) + 128
      r = contrast * (r - 128) + 128;
      g = contrast * (g - 128) + 128;
      b = contrast * (b - 128) + 128;

      // 寫入數據 (Clamping 自動由 Uint8ClampedArray 處理)
      dest[i] = r;
      dest[i + 1] = g;
      dest[i + 2] = b;
      dest[i + 3] = 255; // Alpha
    }

    ctx.putImageData(imageData, 0, 0);
  };

  // 3. 點擊畫面選取片基顏色
  const handleCanvasClick = (e) => {
    if (!isPickingBase || !originalDataRef.current) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) * (canvas.width / rect.width));
    const y = Math.floor(
      (e.clientY - rect.top) * (canvas.height / rect.height)
    );

    const ctx = canvas.getContext('2d');
    // 注意：我們要讀取「原始數據」的顏色，而不是已經處理過的顏色
    // 但為了直觀，我們讀取原本的負片顏色。由於現在畫面上可能已經是處理過的圖，
    // 所以我們直接從 originalDataRef 讀取

    // 計算 array index
    const index = (y * canvas.width + x) * 4;
    const data = originalDataRef.current.data;

    setBaseColor({
      r: data[index],
      g: data[index + 1],
      b: data[index + 2],
    });

    setIsPickingBase(false); // 選完自動關閉
  };

  // 重置功能
  const resetSettings = () => {
    setSettings({
      brightness: 1.1,
      contrast: 1.2,
      rBal: 0,
      gBal: 0,
      bBal: 0,
    });
  };

  // 處理滑桿變更
  const handleSliderChange = (name, value) => {
    setSettings((prev) => ({ ...prev, [name]: parseFloat(value) }));
  };

  return (
    <div className="container">
      <h1>🎞️ 菲林沖洗預覽室</h1>

      {/* 按鈕區 */}
      <div className="btn-group">
        <div className="upload-btn-wrapper">
          <button className="primary">📸 影相 / 上載</button>
          {/* capture="environment" 讓手機優先開啟後置鏡頭 */}
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
