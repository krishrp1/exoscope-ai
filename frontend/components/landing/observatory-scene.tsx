"use client";

import { useEffect, useRef, type RefObject } from "react";

/*
 * The hero's cinematic background, drawn by one WebGL fragment shader:
 *  - an observatory interior: sculpted glossy-black architecture with silver-rimmed windows,
 *  - through the windows, a starfield and the Milky Way band, with slight cursor parallax,
 *  - a moon: craters, maria and a soft terminator. The cursor is the sun, so moving it changes the phase.
 * Raw WebGL instead of Three.js: one full-screen shader does not need a 600 KB library.
 *
 * Performance: the canvas sits inside the hero (scrolls natively, no JS tracking), renders below
 * device resolution, stops when off screen, steps resolution down if frames run slow, and draws a
 * single still frame for prefers-reduced-motion. Without WebGL the CSS fallback in globals.css shows.
 */

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform vec3 uBlob;       // moon centre (scene units) and radius
uniform vec3 uLight;      // direction of the sunlight on the moon

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0., a = .5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= .5; }
  return v;
}

/* ---- sky seen through the windows ---- */
vec3 stars(vec2 p, float scale, float thresh) {
  vec2 g = p * scale, c = floor(g), f = fract(g) - .5;
  float h = hash(c);
  if (h < thresh) return vec3(0.);
  vec2 o = vec2(hash(c + 3.1), hash(c + 7.7)) - .5;
  float d = length(f - o * .7);
  float tw = .65 + .35 * sin(h * 40.);              // fixed brightness: the scene redraws only on input
  vec3 tint = mix(vec3(.75, .82, 1.), vec3(1., .86, .7), hash(c + 1.3));
  return tint * exp(-d * d * 90.) * tw * (h - thresh) / (1. - thresh) * 3.;
}
vec3 sky(vec2 p) {
  vec2 q = p;
  vec3 col = mix(vec3(.012, .016, .03), vec3(.03, .04, .07), smoothstep(-.6, .6, q.y));
  // Milky Way band, tilted, with dark dust lanes
  vec2 b = mat2(.9, -.44, .44, .9) * q;
  float band = exp(-b.y * b.y * 9.);
  float dust = fbm(b * 3.2 + 4.);
  float lanes = smoothstep(.35, .75, fbm(b * 7. + 9.));
  vec3 glow = mix(vec3(.55, .62, .85), vec3(.95, .78, .55), fbm(b * 2. + 2.));
  col += glow * band * (.25 + .55 * dust) * (1. - .7 * lanes);
  col += stars(q, 90., .93) + stars(q + 11., 190., .96) * band * 1.5 + stars(q + 5., 40., .985);
  return col;
}

/* ---- architecture: wall where d > 0, window where d < 0 ---- */
float ellipse(vec2 p, vec2 c, vec2 r, float a) {
  vec2 q = p - c;
  q = mat2(cos(a), -sin(a), sin(a), cos(a)) * q;
  return (length(q / r) - 1.) * min(r.x, r.y);
}
float smin(float a, float b, float k) {
  float h = clamp(.5 + .5 * (b - a) / k, 0., 1.);
  return mix(b, a, h) - k * h * (1. - h);
}
float windows(vec2 p) {
  float A = uRes.x / uRes.y;
  float sx = clamp(A / 1.8, .55, 1.25);              // compress the layout on narrow screens
  vec2 q = p;
  q.x /= sx;
  float d = ellipse(q, vec2(.18, .66), vec2(.78, .25), -.16);          // ceiling skylight
  d = min(d, ellipse(q, vec2(-.2, .12), vec2(.27, .1), .14));          // central lens
  d = min(d, ellipse(q, vec2(.78, -.16), vec2(.5, .36), .28));         // panorama
  d = min(d, ellipse(q, vec2(-.98, -.05), vec2(.2, .42), -.1));        // left window
  d = smin(d, ellipse(q, vec2(-.42, -.4), vec2(.13, .18), 0.), .04);   // arches near the floor
  d = smin(d, ellipse(q, vec2(-.14, -.44), vec2(.1, .14), 0.), .04);
  d = smin(d, ellipse(q, vec2(.12, -.42), vec2(.08, .11), 0.), .04);
  return -d * sx;
}

/* ---- moon ---- */
float hash3(vec3 p) { p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise3(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3. - 2. * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm3(vec3 p) {
  float v = 0., a = .5;
  for (int i = 0; i < 4; i++) { v += a * noise3(p); p = p * 2.1 + 3.7; a *= .5; }
  return v;
}
// bowl-shaped craters with raised rims, scattered on a 3D cell grid
float craters(vec3 p, float scale) {
  vec3 g = p * scale, i = floor(g), f = fract(g);
  float h = 0.;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
    vec3 o = vec3(float(x), float(y), float(z));
    if (hash3(i + o + 7.) < .5) continue;
    vec3 c = o + vec3(hash3(i + o), hash3(i + o + 5.1), hash3(i + o + 9.7));
    float r = .18 + .22 * hash3(i + o + 2.3);
    float d = length(f - c) / r;
    h += d < 1. ? (d * d - 1.) * .5 : 0.;
    h += .22 * exp(-pow((d - 1.) * 5., 2.));
  }
  return h;
}
float moonHeight(vec3 sp) { return craters(sp, 3.) * .6 + craters(sp, 7.) * .3 + fbm3(sp * 9.) * .25; }

void main() {
  vec2 p = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
  float px = 1.5 / uRes.y;

  // background: sky through windows, glossy black architecture around them
  float d = windows(p);
  vec3 col = sky(p);
  if (d > -px) {
    vec2 e = vec2(.002, 0.);
    vec2 g = vec2(windows(p + e.xy) - d, windows(p + e.yx) - d) / .002;
    float bevel = 1. - smoothstep(0., .035, d);                          // the rounded edge of the wall
    vec3 n = normalize(vec3(-g * bevel * 1.6, 1.));
    vec3 l = normalize(vec3(.35, .55, .75));
    float spec = pow(max(dot(reflect(-l, n), vec3(0., 0., 1.)), 0.), 24.) * bevel;
    float rim = bevel * bevel * (.25 + .75 * max(dot(-normalize(g + 1e-5), vec2(.2, -.98)), 0.));
    float sheen = .05 * fbm(p * 2.5 + 3.) * smoothstep(.0, .3, d);       // faint reflections on the black
    vec3 wall = vec3(.01) + vec3(.9, .92, .96) * (rim * .55 + spec * .9) + sheen;
    col = mix(col, wall, smoothstep(-px, px, d));
  }

  // the moon: an analytic sphere, so no ray marching
  vec2 q = (p - uBlob.xy) / uBlob.z;
  float rr = length(q);
  if (rr < 1.) {
    vec3 n = vec3(q, sqrt(1. - rr * rr));
    vec3 sp = mat3(.95, 0., .31, 0., 1., 0., -.31, 0., .95) * n;   // a slight turn, so the maria sit off-centre
    vec3 t1 = normalize(cross(n, vec3(0., 1., 0.)) + vec3(1e-4, 0., 0.)), t2 = cross(n, t1);
    float e = .004, h = moonHeight(sp);
    vec3 nb = normalize(n - (t1 * (moonHeight(sp + t1 * e) - h) + t2 * (moonHeight(sp + t2 * e) - h)) / e * .035);
    float maria = smoothstep(.5, .62, fbm3(sp * 1.7 + 2.));
    float albedo = mix(.66, .34, maria) * (.86 + .28 * fbm3(sp * 5.)) + .05 * clamp(h, 0., 1.);
    float diff = pow(clamp(dot(nb, uLight), 0., 1.), .75);              // lunar surfaces stay bright toward the limb
    vec3 moon = vec3(albedo) * vec3(1., .97, .92) * diff * 1.35 + vec3(albedo) * .02;   // + faint earthshine
    col = mix(moon, col, smoothstep(1. - 2. * px / uBlob.z, 1., rr));
  } else {
    // a faint glow on the lit side, from the moon's own light scattering in the optics
    col += vec3(.6, .65, .75) * .07 * exp(-(rr - 1.) * 7.) * max(dot(normalize(q), normalize(uLight.xy + 1e-4)), 0.);
  }

  // vignette and a cinematic curve
  float v = smoothstep(1.25, .35, length(p * vec2(.8, 1.)));
  col *= .55 + .45 * v;
  col = col / (1. + col * .35);
  gl_FragColor = vec4(pow(col, vec3(.95)), 1.);
}`;

const VERT = "attribute vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }";

export function ObservatoryScene({ anchor }: { anchor: RefObject<HTMLElement | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // preserveDrawingBuffer: the background is drawn once, later frames repaint only the moon's box
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "high-performance", preserveDrawingBuffer: true });
    const fail = () => document.documentElement.classList.add("no-webgl");
    if (!gl) return fail();

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? "shader");
      return sh;
    };
    const prog = gl.createProgram()!;
    try {
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link");
    } catch (err) {
      console.warn("[observatory] WebGL unavailable, using the static fallback:", (err as Error).message);
      return fail();
    }
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = (n: string) => gl.getUniformLocation(prog, n);
    const U = { res: u("uRes"), blob: u("uBlob"), light: u("uLight") };

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    let scale = 0.8; // below device resolution; the frame guard can lower it further
    let w = 1, h = 1;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1 : 1.5) * scale;
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
      full = true;                    // a resize clears the buffer: repaint everything once
      kick();
    };

    // pointer in scene units (y up, height = 1); the sunlight follows it, eased
    const target = { x: 0, y: 0, active: 0 };
    const cur = { lx: -0.62, ly: 0.42, lz: 0.66 };
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      target.x = (e.clientX - r.left - r.width / 2) / r.height;
      target.y = -(e.clientY - r.top - r.height / 2) / r.height;
      target.active = 1;
      kick();
    };
    const onLeave = () => { target.active = 0; kick(); };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    const onUp = (e: PointerEvent) => { if (e.pointerType !== "mouse") onLeave(); }; // a lifted finger releases the field
    window.addEventListener("pointerup", onUp, { passive: true });

    const blob = () => {
      const a = anchor.current?.getBoundingClientRect();
      const c = canvas.getBoundingClientRect();
      if (!a || !c.height) return [0.25, 0, 0.2];
      return [
        (a.left + a.width / 2 - c.left - c.width / 2) / c.height,
        -(a.top + a.height / 2 - c.top - c.height / 2) / c.height,
        (Math.min(a.width, a.height) / 2 / c.height) * 0.62,
      ];
    };

    let last = performance.now(), raf = 0, still = reduce, full = true;
    let frames = 0, slow = 0;
    /** Draws one frame; returns true while something is still easing toward its target. */
    function draw(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const k = reduce || still ? 1 : 1 - Math.exp(-dt * 5);
      const [bx, by, br] = blob();
      // the cursor is the sun: light comes from the cursor's side of the moon; otherwise from the upper left
      let tx = -0.62, ty = 0.42, tz = 0.66;
      if (target.active) {
        const dx = target.x - bx, dy = target.y - by, len = Math.hypot(dx, dy) || 1;
        [tx, ty, tz] = [(dx / len) * 0.85, (dy / len) * 0.85, 0.53];
      }
      const before = cur.lx + cur.ly + cur.lz;
      cur.lx += (tx - cur.lx) * k;
      cur.ly += (ty - cur.ly) * k;
      cur.lz += (tz - cur.lz) * k;
      const ll = Math.hypot(cur.lx, cur.ly, cur.lz) || 1;
      gl!.uniform2f(U.res, canvas!.width, canvas!.height);
      gl!.uniform3f(U.blob, bx, by, br);
      gl!.uniform3f(U.light, cur.lx / ll, cur.ly / ll, cur.lz / ll);
      if (full) {
        gl!.disable(gl!.SCISSOR_TEST);
        full = false;
      } else {
        // only the moon and its glow change with the light: repaint that box, keep the rest
        const H = canvas!.height, cx = canvas!.width / 2 + bx * H, cy = H / 2 + by * H, half = br * H * 1.35;
        gl!.enable(gl!.SCISSOR_TEST);
        gl!.scissor(Math.floor(cx - half), Math.floor(cy - half), Math.ceil(half * 2), Math.ceil(half * 2));
      }
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
      return Math.abs(cur.lx + cur.ly + cur.lz - before) > 1e-4;
    }

    // Runs only while something moves, then stops: an idle hero costs nothing. The frame guard drops
    // resolution if frames run slow, and at the floor stops easing (draws jump straight to the target).
    function loop(now: number) {
      const interval = now - last;
      const moving = draw(now);
      if (++frames > 30) {
        slow += interval;
        if (frames === 90) {
          if (slow / 60 > 25) {
            if (scale > 0.35) { scale *= 0.75; resize(); }
            else still = true;
          }
          frames = 30; slow = 0;
        }
      }
      raf = moving && !still ? requestAnimationFrame(loop) : 0;
    }
    function kick() {
      if (!visible || document.hidden) return;
      if (reduce || still) { draw(performance.now()); return; }
      if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
    }

    let visible = true;
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) kick(); else { cancelAnimationFrame(raf); raf = 0; }
    });
    io.observe(canvas);
    const ro = new ResizeObserver(resize); // the hero's box, not the window: phone toolbars do not trigger it
    ro.observe(canvas);
    const onVis = () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else kick(); };
    document.addEventListener("visibilitychange", onVis);
    resize();
    canvas.dataset.ready = "true";
    // a lost context (e.g. a mobile GPU resets it) would leave the hero black: show the CSS fallback instead
    const onLost = (e: Event) => { e.preventDefault(); cancelAnimationFrame(raf); fail(); };
    canvas.addEventListener("webglcontextlost", onLost);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("webglcontextlost", onLost);
    };
  }, [anchor]);

  return <canvas ref={canvasRef} aria-hidden="true" className="observatory-scene absolute inset-x-0 top-0 h-[min(100%,110svh)] w-full" />;
}
