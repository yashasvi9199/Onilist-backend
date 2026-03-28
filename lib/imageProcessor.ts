import sharp from 'sharp';
import axios from 'axios';

export interface ProcessingOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'webp' | 'avif' | 'jpeg' | 'png';
  brightness?: number; // -1 to 1
  contrast?: number; // -1 to 1
  gamma?: number; // 0.5 to 3
}

export async function fetchAndProcessImage(
  url: string,
  options: ProcessingOptions = {}
): Promise<Buffer> {
  // Fetch the image with headers to bypass bot detection
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': new URL(url).origin,
      'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'image',
      'sec-fetch-mode': 'no-cors',
      'sec-fetch-site': 'cross-site',
    },
    timeout: 30000,
    maxRedirects: 5,
  });

  let pipeline = sharp(Buffer.from(response.data));

  // Get metadata for aspect ratio preservation
  const metadata = await pipeline.metadata();

  // Resize if dimensions specified
  if (options.width || options.height) {
    pipeline = pipeline.resize({
      width: options.width,
      height: options.height,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  // Apply color adjustments
  if (options.brightness !== undefined || options.contrast !== undefined) {
    const brightness = options.brightness !== undefined ? 1 + options.brightness : 1;
    const contrast = options.contrast !== undefined ? 1 + options.contrast : 1;
    
    pipeline = pipeline.modulate({
      brightness,
    }).linear(contrast, -(128 * (contrast - 1)));
  }

  // Apply gamma correction
  if (options.gamma !== undefined) {
    pipeline = pipeline.gamma(options.gamma);
  }

  // Convert to target format
  const format = options.format || 'webp';
  const quality = options.quality || 85;

  switch (format) {
    case 'webp':
      pipeline = pipeline.webp({ quality, effort: 4 });
      break;
    case 'avif':
      pipeline = pipeline.avif({ quality, effort: 4 });
      break;
    case 'jpeg':
      pipeline = pipeline.jpeg({ quality, progressive: true });
      break;
    case 'png':
      pipeline = pipeline.png({ compressionLevel: 6 });
      break;
  }

  return pipeline.toBuffer();
}

export async function getImageMetadata(url: string): Promise<{
  width: number;
  height: number;
  format: string;
  edgeColors: {
    top: string;
    bottom: string;
    left: string;
    right: string;
    average: string;
  };
}> {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': new URL(url).origin,
    },
    timeout: 30000,
  });

  const image = sharp(Buffer.from(response.data));
  const metadata = await image.metadata();

  // Sample edge colors
  const { width = 0, height = 0 } = metadata;
  
  if (width === 0 || height === 0) {
    throw new Error('Invalid image dimensions');
  }

  // Extract edge samples
  const sampleSize = Math.min(10, Math.floor(Math.min(width, height) / 10));
  
  const [topStrip, bottomStrip, leftStrip, rightStrip] = await Promise.all([
    image.clone().extract({ left: 0, top: 0, width, height: sampleSize }).raw().toBuffer(),
    image.clone().extract({ left: 0, top: height - sampleSize, width, height: sampleSize }).raw().toBuffer(),
    image.clone().extract({ left: 0, top: 0, width: sampleSize, height }).raw().toBuffer(),
    image.clone().extract({ left: width - sampleSize, top: 0, width: sampleSize, height }).raw().toBuffer(),
  ]);

  const calculateAverageColor = (buffer: Buffer): string => {
    let r = 0, g = 0, b = 0;
    const pixelCount = buffer.length / 3;
    
    for (let i = 0; i < buffer.length; i += 3) {
      r += buffer[i];
      g += buffer[i + 1];
      b += buffer[i + 2];
    }
    
    r = Math.round(r / pixelCount);
    g = Math.round(g / pixelCount);
    b = Math.round(b / pixelCount);
    
    return `rgb(${r}, ${g}, ${b})`;
  };

  const topColor = calculateAverageColor(topStrip);
  const bottomColor = calculateAverageColor(bottomStrip);
  const leftColor = calculateAverageColor(leftStrip);
  const rightColor = calculateAverageColor(rightStrip);

  // Calculate overall average
  const allStrips = Buffer.concat([topStrip, bottomStrip, leftStrip, rightStrip]);
  const averageColor = calculateAverageColor(allStrips);

  return {
    width,
    height,
    format: metadata.format || 'unknown',
    edgeColors: {
      top: topColor,
      bottom: bottomColor,
      left: leftColor,
      right: rightColor,
      average: averageColor,
    },
  };
}

export async function stitchImages(
  urls: string[],
  options: ProcessingOptions = {}
): Promise<Buffer> {
  // Fetch and process all images
  const images = await Promise.all(
    urls.map(async (url) => {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': new URL(url).origin,
        },
        timeout: 30000,
      });
      
      const image = sharp(Buffer.from(response.data));
      const metadata = await image.metadata();
      
      // Resize to consistent width if needed
      const targetWidth = options.width || 1200;
      if (metadata.width && metadata.width !== targetWidth) {
        return image.resize({ width: targetWidth }).toBuffer();
      }
      
      return image.toBuffer();
    })
  );

  // Get dimensions of all images
  const dimensions = await Promise.all(
    images.map(async (buffer) => {
      const metadata = await sharp(buffer).metadata();
      return { width: metadata.width || 0, height: metadata.height || 0 };
    })
  );

  const totalHeight = dimensions.reduce((sum, d) => sum + d.height, 0);
  const maxWidth = Math.max(...dimensions.map(d => d.width));

  // Create composite image
  let currentY = 0;
  const composites = dimensions.map((d, i) => {
    const result = {
      input: images[i],
      top: currentY,
      left: Math.floor((maxWidth - d.width) / 2),
    };
    currentY += d.height;
    return result;
  });

  let stitched = sharp({
    create: {
      width: maxWidth,
      height: totalHeight,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  }).composite(composites);

  // Apply format conversion
  const format = options.format || 'webp';
  const quality = options.quality || 85;

  switch (format) {
    case 'webp':
      stitched = stitched.webp({ quality });
      break;
    case 'avif':
      stitched = stitched.avif({ quality });
      break;
    case 'jpeg':
      stitched = stitched.jpeg({ quality, progressive: true });
      break;
  }

  return stitched.toBuffer();
}

export async function generateThumbnails(
  imageBuffer: Buffer,
  positions: number[] // Array of Y positions (0-1 normalized)
): Promise<Buffer[]> {
  return Promise.all(
    positions.map(async (pos) => {
      const image = sharp(imageBuffer);
      const metadata = await image.metadata();
      const { width = 0, height = 0 } = metadata;

      const thumbHeight = 150;
      const thumbWidth = Math.round((width / height) * thumbHeight);
      
      const extractTop = Math.max(0, Math.floor(pos * height) - thumbHeight / 2);
      const extractHeight = Math.min(thumbHeight, height - extractTop);

      return image
        .extract({
          left: 0,
          top: extractTop,
          width,
          height: extractHeight,
        })
        .resize({ width: thumbWidth, height: thumbHeight, fit: 'cover' })
        .webp({ quality: 60 })
        .toBuffer();
    })
  );
}