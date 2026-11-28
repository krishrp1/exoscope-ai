"use client";

import { useEffect, useRef, type RefObject } from "react";

/*
 * The hero's cinematic background, drawn by one WebGL fragment shader:
 *  - an observatory interior: sculpted glossy-black architecture with silver-rimmed windows,
 *  - through the windows, a starfield and the Milky Way band, with slight cursor parallax,
 *  - a ray-marched ferrofluid sphere whose spikes rise toward the cursor, like a magnetic field.
 * Raw WebGL instead of Three.js: one full-screen shader does not need a 600 KB library.
 *
 * Performance: the canvas sits inside the hero (scrolls natively, no JS tracking), renders below
 * device resolution, stops when off screen, steps resolution down if frames run slow, and draws a
 * single still frame for prefers-reduced-motion. Without WebGL the CSS fallback in globals.css shows.
 */

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;      // scene units (y up, height = 1), centre = 0
uniform float uMagnet;    // 0..1 cursor proximity to the fluid
uniform vec3 uBlob;       // fluid centre (scene units) and radius
uniform mat3 uRot;        // fluid orientation

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
  float tw = .65 + .35 * sin(uTime * (1. + 3. * h) + h * 40.);
  vec3 tint = mix(vec3(.75, .82, 1.), vec3(1., .86, .7), hash(c + 1.3));
  return tint * exp(-d * d * 90.) * tw * (h - thresh) / (1. - thresh) * 3.;
}
vec3 sky(vec2 p) {
  vec2 q = p + uMouse * .015;                        // far layer: barely moves
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
  vec2 q = p + uMouse * .03;                         // near layer: more parallax
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

/* ---- ferrofluid ---- */
float fluid(vec3 p) {
  float len = length(p);
  if (len > 1.65) return len - 1.6;                  // outside every spike tip: skip the spike loop (most ray steps)
  vec3 n = p / max(len, 1e-4);
  vec3 m = normalize(vec3(uMouse - uBlob.xy, .9) * vec3(1., 1., 1.));
  float s = 0.;
  for (int i = 0; i < 48; i++) {                     // sharp cones on a Fibonacci sphere, like real ferrofluid spikes
    float fi = float(i);
    float y = 1. - (fi + .5) * (2. / 48.);
    float r = sqrt(1. - y * y);
    float ph = fi * 2.39996;
    vec3 dir = uRot * vec3(cos(ph) * r, y, sin(ph) * r);
    // height falls linearly with the angle from the spike's axis (a pointed cone), slightly concave like
    // real ferrofluid; a function of the cosine instead would round every tip off
    float t = clamp(1. - sqrt(max(2. - 2. * dot(n, dir), 0.)) / .24, 0., 1.);   // chord ~ angle, no acos
    float lift = .55 + .45 * uMagnet * max(dot(dir, m), 0.);   // taller on the magnet's side
    s = max(s, pow(t, 1.35) * lift);
  }
  float breathe = .04 * sin(uTime * .8);
  return (len - .9 - (.62 + breathe) * s) * .32;               // small steps: steep cones break larger ones
}
vec3 fluidNormal(vec3 p) {
  vec2 e = vec2(.002, -.002);
  return normalize(e.xyy * fluid(p + e.xyy) + e.yyx * fluid(p + e.yyx) + e.yxy * fluid(p + e.yxy) + e.xxx * fluid(p + e.xxx));
}
vec3 studio(vec3 r) {
  // a photographer's studio for chrome-black liquid: striped top softbox, bright horizon ring,
  // a cool window light from the side and near-black everywhere else
  float top = smoothstep(.45, .9, r.y) * (.75 + .25 * smoothstep(-.2, .2, sin(r.x * 9.)));
  float ring = exp(-pow((r.y + .02) * 7., 2.)) * (.55 + .45 * sin(atan(r.z, r.x) * 4. + 1.));
  float side = smoothstep(.55, .95, r.x) * smoothstep(-.3, .4, r.y);
  return vec3(.006) + vec3(1.6) * top + vec3(1.1) * ring + vec3(.6, .7, .95) * side * .8;
}

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

  // ferrofluid, ray marched inside its bounding circle only
  vec2 q = (p - uBlob.xy) / uBlob.z;
  if (length(q) < 1.75) {
    vec3 ro = vec3(0., 0., 3.6);
    vec3 rd = normalize(vec3(q * .29, -1.));
    float t = 0., minD = 1e3;
    bool hit = false;
    for (int i = 0; i < 110; i++) {
      vec3 pos = ro + rd * t;
      float h = fluid(pos);
      minD = min(minD, h);
      if (h < .0015) { hit = true; break; }
      t += h;
      if (t > 6.) break;
    }
    if (hit) {
      vec3 pos = ro + rd * t;
      vec3 n = fluidNormal(pos);
      vec3 r = reflect(rd, n);
      float fres = pow(1. - max(dot(n, -rd), 0.), 3.);
      vec3 fl = studio(r) * (.45 + .55 * fres);                          // chrome-black: strong reflections
      vec3 key = normalize(vec3(-.5, .7, .6));
      fl += vec3(1.) * pow(max(dot(r, key), 0.), 80.) * 1.4;             // the key light's glint
      fl *= .5 + .5 * smoothstep(-.5, .5, n.y);                          // darker underside
      col = fl;
    } else {
      col *= 1. - .55 * exp(-minD * 18.);                               // soft contact darkening at the edge
    }
  }

  // vignette and a cinematic curve
  float v = smoothstep(1.25, .35, length(p * vec2(.8, 1.)));
  col *= .55 + .45 * v;
  col = col / (1. + col * .35);
  gl_FragColor = vec4(pow(col, vec3(.95)), 1.);
}`;

const VERT = "attribute vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }";

function rotation(ax: number, ay: number): number[] {
  const [cx, sx, cy, sy] = [Math.cos(ax), Math.sin(ax), Math.cos(ay), Math.sin(ay)];
  // Ry * Rx, column-major for WebGL
  return [cy, 0, -sy, sx * sy, cx, sx * cy, cx * sy, -sx, cx * cy];
}

export function ObservatoryScene({ anchor }: { anchor: RefObject<HTMLElement | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "high-performance" });
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
    const U = { res: u("uRes"), time: u("uTime"), mouse: u("uMouse"), magnet: u("uMagnet"), blob: u("uBlob"), rot: u("uRot") };

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
      if (reduce || still) draw(performance.now());
    };

    // pointer in scene units (y up, height = 1); eased so the field feels liquid
    const target = { x: 0, y: 0, active: 0 };
    const cur = { x: 0, y: 0, magnet: 0, ax: 0.25, ay: 0 };
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      target.x = (e.clientX - r.left - r.width / 2) / r.height;
      target.y = -(e.clientY - r.top - r.height / 2) / r.height;
      target.active = 1;
    };
    const onLeave = () => { target.active = 0; };
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

    let last = performance.now(), raf = 0, still = reduce;
    let frames = 0, slow = 0;
    function draw(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const k = reduce ? 1 : 1 - Math.exp(-dt * 4);
      cur.x += (target.x - cur.x) * k;
      cur.y += (target.y - cur.y) * k;
      const [bx, by, br] = blob();
      const dist = Math.hypot(cur.x - bx, cur.y - by);
      const magnet = reduce ? 0 : target.active * Math.max(0, Math.min(1, 1.6 - dist / (br * 2.6)));
      cur.magnet += (magnet - cur.magnet) * (reduce ? 1 : 1 - Math.exp(-dt * 5));
      // slow drift, tilting toward the cursor
      cur.ax += ((reduce ? 0.25 : 0.25 - cur.y * 0.6) - cur.ax) * k;
      cur.ay = reduce ? 0.4 : cur.ay + dt * 0.12 + (cur.x - bx) * dt * 0.4;
      gl!.uniform2f(U.res, canvas!.width, canvas!.height);
      gl!.uniform1f(U.time, reduce ? 0 : now / 1000);
      gl!.uniform2f(U.mouse, cur.x, cur.y);
      gl!.uniform1f(U.magnet, cur.magnet);
      gl!.uniform3f(U.blob, bx, by, br);
      gl!.uniformMatrix3fv(U.rot, false, rotation(cur.ax, cur.ay));
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    }

    // Frame guard: after a warm-up, if frames average over 25 ms, drop resolution; at the floor, hold a still frame.
    function loop(now: number) {
      const interval = now - last;
      draw(now);
      if (++frames > 30) {
        slow += interval;
        if (frames === 90) {
          if (slow / 60 > 25) {
            if (scale > 0.35) { scale *= 0.75; resize(); }
            else { still = true; return; }
          }
          frames = 30; slow = 0;
        }
      }
      raf = requestAnimationFrame(loop);
    }
    const start = () => {
      cancelAnimationFrame(raf);
      if (still || document.hidden || !visible) return;
      last = performance.now(); frames = 0; slow = 0;
      raf = requestAnimationFrame(loop);
    };

    let visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); else cancelAnimationFrame(raf); });
    io.observe(canvas);
    const ro = new ResizeObserver(resize); // the hero's box, not the window: phone toolbars do not trigger it
    ro.observe(canvas);
    const onVis = () => (document.hidden ? cancelAnimationFrame(raf) : start());
    document.addEventListener("visibilitychange", onVis);
    resize();
    if (reduce) draw(performance.now());
    else start();
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
