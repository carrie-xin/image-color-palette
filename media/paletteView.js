/*
 * 文件用途：在 VS Code Webview 中渲染图片色卡，提取主色并支持点击复制色号
 * 作者：Xin
 */

(function(){
  // VS Code 消息通道
  const vscode = (typeof window !== 'undefined' && window.__VSC__) ? window.__VSC__ : null;

  /**
   * 初始化入口：图像加载后开始计算并渲染
   * @param {HTMLImageElement} img 图片元素
   * @return {void}
   */
  function init(img){
    // 添加配置UI
    const configUI = document.createElement('div');
    configUI.className = 'config-ui';
    
    // 色卡数量选择
    // 修改色卡数量选项
    // 修复色卡数量选项重复问题
    const countSelect = document.createElement('select');
    countSelect.id = 'colorCount';
    [4, 6, 8].forEach(num => {
      const option = document.createElement('option');
      option.value = num;
      option.textContent = `${num}色`;
      if(num === 6) option.selected = true;
      countSelect.appendChild(option);
    });
    
    // 色号类型选择
    const typeSelect = document.createElement('select');
    typeSelect.id = 'colorType';
    ['HEX', 'RGB'].forEach(type => {
      const option = document.createElement('option');
      option.value = type;
      option.textContent = type;
      option.selected = type === 'HEX';
      typeSelect.appendChild(option);
    });
    
    // 添加事件监听
    countSelect.addEventListener('change', () => {
      const count = parseInt(countSelect.value);
      const pixels = sampleImagePixels(img, 600);
      const colors = kmeansColors(pixels, count, 10);
      renderPalette(colors);
    });
    
    typeSelect.addEventListener('change', () => {
      const colors = Array.from(document.querySelectorAll('.swatch-color'))
        .map(el => {
          const bg = getComputedStyle(el).backgroundColor;
          // 将rgb格式转换回hex
          if (bg.startsWith('rgb')) {
            const [r, g, b] = bg.match(/\d+/g).map(Number);
            return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
          }
          return bg;
        });
      renderPalette(colors);
    });
    
    // 一键复制按钮
    const copyAllBtn = document.createElement('button');
    copyAllBtn.className = 'copy-all';
    copyAllBtn.textContent = '复制全部色号';
    copyAllBtn.addEventListener('click', copyAllColors);
    
    configUI.appendChild(document.createTextNode('色卡数量:'));
    configUI.appendChild(countSelect);
    configUI.appendChild(document.createTextNode('色号格式:'));
    configUI.appendChild(typeSelect);
    configUI.appendChild(copyAllBtn);
    
    document.getElementById('app').insertBefore(configUI, document.getElementById('paletteWrap'));
    
    if (!img.complete) {
      img.addEventListener('load', () => handleImage(img));
    } else {
      handleImage(img);
    }
  }

  /**
   * 复制全部色号到剪贴板
   * @return {void}
   */
  function copyAllColors() {
    const colorType = document.getElementById('colorType').value;
    const colors = Array.from(document.querySelectorAll('.swatch-hex'))
      .map(el => el.textContent);
    
    if (vscode){
      vscode.postMessage({ type: 'copyAll', colors, colorType });
    } else if (navigator?.clipboard?.writeText){
      navigator.clipboard.writeText(colors.join('\n'));
    }
  }

  /**
   * 将 HEX 或 RGB 字符串渲染为色卡 UI
   * @param {string[]} colors 颜色数组
   * @return {void}
   */
  function renderPalette(colors){
    const wrap = document.getElementById('paletteWrap');
    const colorType = document.getElementById('colorType')?.value || 'HEX';
    if (!wrap) return;
    wrap.innerHTML = '';

    (colors || []).forEach(hex => {
      const item = document.createElement('div');
      item.className = 'swatch';

      const colorBlock = document.createElement('div');
      colorBlock.className = 'swatch-color';
      colorBlock.style.background = hex;

      const label = document.createElement('button');
      label.className = 'swatch-hex';
      label.textContent = colorType === 'RGB' ? hexToRgb(hex) : hex;
      label.title = '点击复制色号';
      label.addEventListener('click', () => copyHex(hex));
      colorBlock.addEventListener('click', () => copyHex(hex));

      item.appendChild(colorBlock);
      item.appendChild(label);
      wrap.appendChild(item);
    });
  }

  /**
   * HEX 转 RGB 字符串
   * @param {string} hex HEX 颜色值
   * @return {string} RGB 字符串
   */
  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgb(${r}, ${g}, ${b})`;
  }

  /**
   * 处理图像：抽样像素、聚类、渲染结果
   * @param {HTMLImageElement} img 图片元素
   * @return {void}
   */
  function handleImage(img){
    try {
      const pixels = sampleImagePixels(img, 600);
      const colors = kmeansColors(pixels, 6, 10);
      renderPalette(colors);
    } catch (err){
      console.error(err);
      renderError(String(err));
    }
  }

  /**
   * 渲染错误信息
   * @param {string} msg 错误文本
   * @return {void}
   */
  function renderError(msg){
    const wrap = document.getElementById('paletteWrap');
    if (wrap){
      wrap.innerHTML = `<div class="error">${escapeHtml(msg)}</div>`;
    }
  }

  /**
   * 复制 HEX 到剪贴板（通过 VS Code 通道）
   * @param {string} hex HEX 文本
   * @return {void}
   */
  function copyHex(hex){
    if (vscode){
      const colorType = document.getElementById('colorType').value;
      if (colorType === 'RGB'){ 
        hex = hexToRgb(hex);
      }
      console.log('colorType', colorType);
      console.log('hex', hex);
      vscode.postMessage({ type: 'copy', hex });
    } else if (navigator?.clipboard?.writeText){
      navigator.clipboard.writeText(hex);
    }
  }

  /**
   * 抽样图片像素（等比缩放到最大边不超过 maxSize）
   * @param {HTMLImageElement} img 图片元素
   * @param {number} maxSize 最大边尺寸
   * @return {number[][]} 像素数组 [[r,g,b], ...]
   */
  function sampleImagePixels(img, maxSize){
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas 不可用');

    const { width: w0, height: h0 } = img;
    const scale = Math.min(1, maxSize / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));

    canvas.width = w; canvas.height = h;
    ctx.drawImage(img, 0, 0, w, h);

    const { data } = ctx.getImageData(0, 0, w, h);
    const pixels = [];
    for (let i = 0; i < data.length; i += 4){
      const a = data[i+3];
      if (a < 10) continue; // 忽略几乎透明像素
      const r = data[i];
      const g = data[i+1];
      const b = data[i+2];
      // 轻度量化减少噪点
      pixels.push([
        (r >> 4) << 4,
        (g >> 4) << 4,
        (b >> 4) << 4,
      ]);
    }
    if (!pixels.length) throw new Error('未获取到有效像素');
    return pixels;
  }

  /**
   * 使用 K-Means 从像素中提取主色
   * @param {number[][]} pixels 像素集合 [[r,g,b], ...]
   * @param {number} k 聚类数（期望主色数量）
   * @param {number} maxIter 最大迭代次数
   * @return {string[]} 提取出的 HEX 颜色数组，按频次降序，最多 k 个
   */
  function kmeansColors(pixels, k = 6, maxIter = 10){
    const uniq = uniquePixels(pixels);
    if (uniq.length <= k){
      return uniq.map(rgbToHex);
    }

    // 初始化质心：随机选取不同像素
    const centers = [];
    const used = new Set();
    while (centers.length < k){
      const idx = Math.floor(Math.random() * uniq.length);
      const key = uniq[idx].join(',');
      if (!used.has(key)){
        used.add(key);
        centers.push([...uniq[idx]]);
      }
    }

    let assignments = new Array(uniq.length).fill(0);
    for (let iter = 0; iter < maxIter; iter++){
      // 1) 归属
      let changed = false;
      for (let i = 0; i < uniq.length; i++){
        let best = 0, bestDist = Infinity;
        for (let c = 0; c < centers.length; c++){
          const d = sqrDist(uniq[i], centers[c]);
          if (d < bestDist){ bestDist = d; best = c; }
        }
        if (assignments[i] !== best){ changed = true; assignments[i] = best; }
      }
      // 2) 重算中心
      const sums = Array.from({ length: k }, () => [0,0,0,0]); // [r,g,b,count]
      for (let i = 0; i < uniq.length; i++){
        const a = assignments[i];
        const p = uniq[i];
        sums[a][0] += p[0];
        sums[a][1] += p[1];
        sums[a][2] += p[2];
        sums[a][3] += 1;
      }
      for (let c = 0; c < k; c++){
        if (sums[c][3] === 0){
          // 空簇：随机重置
          const rp = uniq[Math.floor(Math.random()*uniq.length)];
          centers[c] = [...rp];
        } else {
          centers[c] = [
            Math.round(sums[c][0]/sums[c][3]),
            Math.round(sums[c][1]/sums[c][3]),
            Math.round(sums[c][2]/sums[c][3]),
          ];
        }
      }
      if (!changed) break;
    }

    // 根据频次统计并排序
    const freq = new Array(k).fill(0);
    for (let i = 0; i < uniq.length; i++) freq[assignments[i]]++;
    const palette = centers
      .map((c, idx) => ({ color: c, count: freq[idx] }))
      .sort((a,b) => b.count - a.count)
      .map(x => x.color);

    // 合并相近颜色，避免重复
    const merged = [];
    for (const c of palette){
      if (!merged.some(m => sqrDist(m, c) < 20*20)){
        merged.push(c);
      }
      if (merged.length >= k) break;
    }

    return merged.map(rgbToHex);
  }

  /**
   * 去重像素
   * @param {number[][]} pixels 像素集合
   * @return {number[][]} 去重后像素集合
   */
  function uniquePixels(pixels){
    const seen = new Set();
    const out = [];
    for (const p of pixels){
      const key = p.join(',');
      if (!seen.has(key)){
        seen.add(key);
        out.push(p);
      }
    }
    return out;
  }

  /**
   * 计算平方距离（RGB 空间）
   * @param {number[]} a 颜色 a [r,g,b]
   * @param {number[]} b 颜色 b [r,g,b]
   * @return {number} 距离平方
   */
  function sqrDist(a,b){
    const dr=a[0]-b[0], dg=a[1]-b[1], db=a[2]-b[2];
    return dr*dr + dg*dg + db*db;
  }

  /**
   * RGB -> HEX
   * @param {number[]} rgb [r,g,b]
   * @return {string} #RRGGBB 字符串
   */
  function rgbToHex(rgb){
    const toHex = (n)=> n.toString(16).padStart(2,'0');
    return `#${toHex(rgb[0])}${toHex(rgb[1])}${toHex(rgb[2])}`.toLowerCase();
  }

  /**
   * 简单 HTML 转义
   * @param {string} s 文本
   * @return {string} 转义后
   */
  function escapeHtml(s){
    return s.replace(/[&<>"']/g, (c)=>({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    })[c]);
  }

  // 启动
  const img = document.getElementById('sourceImage');
  if (img) init(img);
})();