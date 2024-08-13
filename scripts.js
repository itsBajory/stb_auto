document.addEventListener('DOMContentLoaded', async () => {
  const backdropDropZone = document.getElementById('backdropDropZone');
  const logoDropZone = document.getElementById('logoDropZone');
  const processButton = document.getElementById('processButton');
  const backdropIndicator = document.getElementById('backdropIndicator');
  const logoIndicator = document.getElementById('logoIndicator');
  const previewButton = document.getElementById('previewButton');
  const progressBar = document.getElementById('progressBar');
  const progressStatus = document.getElementById('progressStatus');
  const output = document.getElementById('output');

  const updateIndicator = (indicator, files) => {
    indicator.textContent = `${files.length} file(s) selected`;
  };

  // Function to handle file drop
  const handleFileDrop = (dropZone, indicator) => {
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');

      const files = e.dataTransfer.files;
      updateIndicator(indicator, files);
      dropZone.files = files; // Store files in the drop zone element for easy access
    });
  };

  handleFileDrop(backdropDropZone, backdropIndicator);
  handleFileDrop(logoDropZone, logoIndicator);

  processButton.addEventListener('click', async () => {
    const backdropFiles = Array.from(backdropDropZone.files || []);
    const logoFiles = Array.from(logoDropZone.files || []);

    if (backdropFiles.length === 0) {
      alert('Please upload at least one backdrop image.');
      return;
    }

    progressStatus.textContent = 'Please wait, processing the images...';
    progressBar.style.width = '1%';
    progressBar.textContent = '1%';

    const ratios = [
      { width: 240, height: 135, format: 'png', addLogo: false },
      { width: 800, height: 450, format: 'png', addLogo: false },
      { width: 1280, height: 480, format: 'png', addLogo: true },
      { width: 640, height: 360, format: 'webp', addLogo: false }
    ];

    const zip = new JSZip();
    const totalImages = backdropFiles.length * ratios.length;
    let processedCount = 0;
    let previewImages = [];

    function updateProgress(percentage) {
      progressBar.style.width = `${percentage}%`;
      progressBar.textContent = `${percentage}%`;
    }

    // Load face-api.js models
    await faceapi.nets.tinyFaceDetector.load('/models');
    await faceapi.nets.faceLandmark68Net.load('/models'); // Ensure FaceLandmark68Net is loaded

    async function detectFacesAndLandmarks(image) {
      const detections = await faceapi.detectAllFaces(image, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks();
      return detections;
    }

    for (let i = 0; i < backdropFiles.length; i++) {
      const backdropFile = backdropFiles[i];
      const logoFile = logoFiles[i];
      const backdropName = backdropFile.name.split('.')[0].replace(/ /g, '_'); // Replace spaces with underscores

      const backdropImage = await loadImage(URL.createObjectURL(backdropFile));

      let logoImage = null;
      if (logoFile) {
        logoImage = await loadImage(URL.createObjectURL(logoFile));
      }

         // Detect faces and landmarks in the backdrop image
    const detections = await detectFacesAndLandmarks(backdropImage);

    for (let ratio of ratios) {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = ratio.width;
      canvas.height = ratio.height;
      
      // Calculate aspect ratios
      const backdropAspectRatio = backdropImage.width / backdropImage.height;
      const canvasAspectRatio = ratio.width / ratio.height;
      
      let drawWidth, drawHeight;
      let offsetX = 0, offsetY = 0;
      
      if (backdropAspectRatio > canvasAspectRatio) {
          // Image is wider relative to its height
          drawWidth = canvas.width;
          drawHeight = drawWidth / backdropAspectRatio;
          offsetY = (canvas.height - drawHeight) / 2; // Center vertically
      } else {
          // Image is taller relative to its width
          drawHeight = canvas.height;
          drawWidth = drawHeight * backdropAspectRatio;
          offsetX = (canvas.width - drawWidth); // Align to the right side
      }
      
      // Draw the image on the canvas to fill the canvas completely
      context.drawImage(backdropImage, 0, 0, backdropImage.width, backdropImage.height, 
                        offsetX, offsetY, drawWidth, drawHeight);
      
      
         // Apply gradient
        if (ratio.width === 1280 && ratio.height === 480) {
          const gradient = context.createLinearGradient(0, 0, 880, 0);
          gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
          gradient.addColorStop(0.5, 'rgba(0, 0, 0, 1)');
          gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
          context.fillStyle = gradient;
          context.fillRect(0, 0, canvas.width, canvas.height);
        }

        if (ratio.addLogo && logoImage) {
          let logoWidth = 400;
          let logoHeight = logoWidth / logoImage.width * logoImage.height;

          if (logoHeight > 180) {
            logoHeight = 180;
            logoWidth = logoHeight / logoImage.height * logoImage.width;
          }

          const logoX = 50;
          const logoY = canvas.height - logoHeight - 40;

          // Create a temporary canvas for the logo to check contrast
          const logoCanvas = document.createElement('canvas');
          const logoContext = logoCanvas.getContext('2d');
          logoCanvas.width = logoWidth;
          logoCanvas.height = logoHeight;
          logoContext.drawImage(logoImage, 0, 0, logoWidth, logoHeight);

          const logoData = logoContext.getImageData(0, 0, logoWidth, logoHeight).data;
          const backdropData = context.getImageData(logoX, logoY, logoWidth, logoHeight).data;

          let contrast = calculateContrast(logoData, backdropData);
          let isLogoBlack = checkIfBlack(logoData);

          if (contrast < 2 || isLogoBlack) { // Contrast threshold or logo is black
            // Make the logo white
            logoContext.globalCompositeOperation = 'source-in';
            logoContext.fillStyle = 'white';
            logoContext.fillRect(0, 0, logoWidth, logoHeight);
          }

          context.drawImage(logoCanvas, logoX, logoY, logoWidth, logoHeight);
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

        processedCount++;
        const percentage = Math.round((processedCount / totalImages) * 75);
        updateProgress(percentage);

        if (ratio.width === 1280 && ratio.height === 480) {
          previewImages.push({ url: URL.createObjectURL(blob), filename: fileName });
        }
      }
    }

    progressStatus.textContent = 'Please wait, we\'re zipping the images for you...';

    zip.generateAsync({ type: "blob" }).then(function (content) {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = 'processed_images.zip';
      link.innerText = 'Download All Images as Zip';
      link.classList.add('btn', 'btn-warning'); // Add the yellow button classes
      output.appendChild(link);

      updateProgress(100);
      progressStatus.textContent = 'Processing complete!';
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

  function calculateContrast(logoData, backdropData) {
    // Simplified contrast calculation for demonstration
    let logoLuminance = 0;
    let backdropLuminance = 0;
    const pixelCount = logoData.length / 4;

    for (let i = 0; i < logoData.length; i += 4) {
      const logoPixel = (0.299 * logoData[i] + 0.587 * logoData[i + 1] + 0.114 * logoData[i + 2]) / 255;
      const backdropPixel = (0.299 * backdropData[i] + 0.587 * backdropData[i + 1] + 0.114 * backdropData[i + 2]) / 255;
      logoLuminance += logoPixel;
      backdropLuminance += backdropPixel;
    }

    logoLuminance /= pixelCount;
    backdropLuminance /= pixelCount;

    const l1 = Math.max(logoLuminance, backdropLuminance);
    const l2 = Math.min(logoLuminance, backdropLuminance);

    return (l1 + 0.05) / (l2 + 0.05);
  }

  function checkIfBlack(imageData) {
    let blackPixelCount = 0;
    const threshold = 4;
    const pixelCount = imageData.length / 4;

    for (let i = 0; i < imageData.length; i += 4) {
      const r = imageData[i];
      const g = imageData[i + 1];
      const b = imageData[i + 2];
      if (r < threshold && g < threshold && b < threshold) {
        blackPixelCount++;
      }
    }

    return blackPixelCount / pixelCount > 0.85; // 85% of pixels are black
  }

});
