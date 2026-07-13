// Ordered (Bayer) dither post-process shader.
// Classic 8x8 Bayer threshold matrix with per-channel quantization.
// Runs LAST in the composer chain, after OutputPass (see scene.js), so it
// dithers already display-encoded (sRGB) values, matching how real
// ordered-dither rendering has always operated.
export const DitherShader = {
  uniforms: {
    tDiffuse: { value: null },
    uPixelSize: { value: 2.0 },
    uLevels: { value: 5.0 },
    // How strongly the dithered/quantized result replaces the smooth
    // source image. 1.0 = full dither (the old behavior, which reads as a
    // rigid dot-grid over the whole frame including empty background).
    // Lower values blend back toward the smooth render so the pattern
    // reads as a subtle texture, not a dominant static overlay.
    uMix: { value: 0.45 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uPixelSize;
    uniform float uLevels;
    uniform float uMix;
    varying vec2 vUv;

    const float bayer8x8[64] = float[64](
       0.0, 32.0,  8.0, 40.0,  2.0, 34.0, 10.0, 42.0,
      48.0, 16.0, 56.0, 24.0, 50.0, 18.0, 58.0, 26.0,
      12.0, 44.0,  4.0, 36.0, 14.0, 46.0,  6.0, 38.0,
      60.0, 28.0, 52.0, 20.0, 62.0, 30.0, 54.0, 22.0,
       3.0, 35.0, 11.0, 43.0,  1.0, 33.0,  9.0, 41.0,
      51.0, 19.0, 59.0, 27.0, 49.0, 17.0, 57.0, 25.0,
      15.0, 47.0,  7.0, 39.0, 13.0, 45.0,  5.0, 37.0,
      63.0, 31.0, 55.0, 23.0, 61.0, 29.0, 53.0, 21.0
    );

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec2 cell = floor(gl_FragCoord.xy / uPixelSize);
      int x = int(mod(cell.x, 8.0));
      int y = int(mod(cell.y, 8.0));
      int index = y * 8 + x;
      float threshold = bayer8x8[index] / 64.0;

      vec3 stepped = floor(texel.rgb * (uLevels - 1.0) + threshold) / (uLevels - 1.0);
      vec3 finalColor = mix(texel.rgb, clamp(stepped, 0.0, 1.0), uMix);
      gl_FragColor = vec4(finalColor, texel.a);
    }
  `,
};

// Particle field: GPU-driven drift so per-frame CPU cost stays flat
// regardless of particle count. Position update happens entirely in the
// vertex shader via velocity * uTime, wrapped with mod() for infinite drift.
export const ParticleShader = {
  uniforms: {
    uTime: { value: 0 },
    uPixelRatio: { value: 1 },
    uBounds: { value: 12.0 },
  },
  vertexShader: /* glsl */ `
    uniform float uTime;
    uniform float uPixelRatio;
    uniform float uBounds;
    attribute vec3 aVelocity;
    attribute vec3 aColor;
    attribute float aSize;
    varying vec3 vColor;

    void main() {
      vColor = aColor;
      vec3 pos = position + aVelocity * uTime;
      pos = mod(pos + uBounds, uBounds * 2.0) - uBounds;

      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      gl_PointSize = aSize * uPixelRatio * (24.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec3 vColor;
    void main() {
      vec2 c = gl_PointCoord - 0.5;
      float d = length(c);
      float alpha = smoothstep(0.5, 0.38, d);
      gl_FragColor = vec4(vColor, alpha * 0.5);
    }
  `,
};
