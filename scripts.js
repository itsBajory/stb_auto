document.addEventListener('DOMContentLoaded', () => {
  const backdropDropZone = document.getElementById('backdropDropZone');
  const logoDropZone = document.getElementById('logoDropZone');
  const backdropInput = document.getElementById('backdropInput');
  const logoInput = document.getElementById('logoInput');
  const processButton = document.getElementById('processButton');
  const backdropIndicator = document.getElementById('backdropIndicator');
  const logoIndicator = document.getElementById('logoIndicator');
  const previewButton = document.getElementById('previewButton');

  const updateIndicator = (indicator, files) => {
    indicator.textContent = `${files.length} file(s) selected`;
  };

  backdropDropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    backdropDropZone.classList.add('dragover');
  });

  backdropDropZone.addEventListener('dragleave', () => {
    backdropDropZone.classList.remove('dragover');
  });

  backdropDropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    backdropDropZone.classList.remove('dragover');
    backdropInput.files = e.dataTransfer.files;
    updateIndicator(backdropIndicator, backdropInput.files);
  });

  logoDropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    logoDropZone.classList.add('dragover');
  });

  logoDropZone.addEventListener('dragleave', () => {
    logoDropZone.classList.remove('dragover');
  });

  logoDropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    logoDropZone.classList.remove('dragover');
    logoInput.files = e.dataTransfer.files;
    updateIndicator(logoIndicator, logoInput.files);
  });

  backdropDropZone.addEventListener('click', () => {
    backdropInput.click();
  });

  logoDropZone.addEventListener('click', () => {
    logoInput.click();
  });

  backdropInput.addEventListener('change', () => {
    updateIndicator(backdropIndicator, backdropInput.files);
  });

  logoInput.addEventListener('change', () => {
    updateIndicator(logoIndicator, logoInput.files);
  });

  processButton.addEventListener('click', async () => {
    const backdropFiles = Array.from(backdropInput.files);
    const logoFiles = Array.from(logoInput.files);

    if (backdropFiles.length === 0) {
      alert('Please upload at least one backdrop image.');
      return;
    }

    const ratios = [
      { width: 240, height: 135, format: 'png', addLogo: false },
      { width: 800, height: 450, format: 'png', addLogo: false },
      { width: 1280, height: 480, format: 'png', addLogo: true },
      { width: 640, height: 360, format: 'webp', addLogo: false }
    ];

    const zip = new JSZip();
    const progressBar = document.getElementById('progressBar');
    const totalImages = backdropFiles.length;
    let processedCount = 0;
    let previewImages = [];

    function updateProgress() {
      processedCount++;
      const percentage = Math.round((processedCount / totalImages) * 100);
      progressBar.style.width = `${percentage}%`;
      progressBar.textContent = `${percentage}%`;
    }

    for (let i = 0; i < backdropFiles.length; i++) {
      const backdropFile = backdropFiles[i];
      const logoFile = logoFiles[i];
      const backdropName = backdropFile.name.split('.')[0].replace(/ /g, '_'); // Replace spaces with underscores

      let backdropImage;
      if (backdropFile.type === "image/vnd.adobe.photoshop") {
        backdropImage = await loadPSD(backdropFile);
      } else {
        backdropImage = await loadImage(URL.createObjectURL(backdropFile));
      }



      let logoImage = null;
      if (logoFile) {
        if (logoFile.type === "image/vnd.adobe.photoshop") {
          logoImage = await loadPSD(logoFile);
        } else {
          logoImage = await loadImage(URL.createObjectURL(logoFile));
        }
      }

      for (let ratio of ratios) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = ratio.width;
        canvas.height = ratio.height;

        const { topCrop } = await SmartCrop.crop(backdropImage, { width: canvas.width, height: canvas.height });
        context.drawImage(backdropImage, topCrop.x, topCrop.y, topCrop.width, topCrop.height, 0, 0, canvas.width, canvas.height);

        // Apply gradient
        const gradient = context.createLinearGradient(0, 0, canvas.width, 0);
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0.7)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        context.fillStyle = gradient;
        context.fillRect(0, 0, canvas.width, canvas.height);

        if (ratio.addLogo && logoImage) {
          let logoWidth = 400;
          let logoHeight = logoWidth / logoImage.width * logoImage.height;

          if (logoHeight > 180) {
            logoHeight = 180;
            logoWidth = logoHeight / logoImage.height * logoImage.width;
          }

          const logoX = 50;
          const logoY = canvas.height - logoHeight - 40;

          context.drawImage(logoImage, logoX, logoY, logoWidth, logoHeight);
        }

        const blob = await new Promise(resolve => canvas.toBlob(resolve, `image/${ratio.format}`));

        // Construct filename with replaced spaces
        const fileName = `${backdropName}_${ratio.width}${ratio.height}.${ratio.format}`.replace(/ /g, '_');

        if (ratio.format === 'webp' && blob.size > 150 * 1024) {
          const reducedQualityBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.7));
          zip.file(fileName, reducedQualityBlob);
        } else {
          zip.file(fileName, blob);
        }

        updateProgress();

        if (ratio.width === 1280 && ratio.height === 480) {
          previewImages.push({ url: URL.createObjectURL(blob), filename: fileName });
        }
      }
    }

    zip.generateAsync({ type: "blob" }).then(function (content) {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = 'processed_images.zip';
      link.innerText = 'Download All Images as Zip';
      document.getElementById('output').appendChild(link);
    });

    previewButton.addEventListener('click', () => {
      previewImages.forEach(image => {
        const previewWindow = window.open();
        previewWindow.document.write(`<img src="${image.url}" alt="${image.filename}" style="max-width: 100%; height: auto;" />`);
      });
    });

    // Show the preview button after processing completes
    previewButton.style.display = 'block';
  });

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function loadPSD(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const psd = PSD.fromArrayBuffer(reader.result);
        psd.parse();
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = psd.image.toPng().src;
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }
});
