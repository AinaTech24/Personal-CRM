"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

/**
 * The 404 illustration: a slowly tumbling wireframe shell inside a drifting
 * starfield, with the whole scene leaning toward the pointer.
 *
 * Rendered on demand rather than shipped with the app — three.js is far too
 * large to load on every page for one error screen, so the caller imports this
 * lazily and shows the static illustration until it arrives.
 *
 * Returns `false` from `onReady` when WebGL isn't available, so the caller can
 * keep the fallback rather than leaving an empty box.
 */
export function NotFoundScene({ onReady }: { onReady?: (ok: boolean) => void }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // Honour a system preference for less movement: the scene still renders,
    // it simply doesn't spin.
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setFailed(true);
      onReady?.(false);
      return;
    }
    if (!renderer.getContext()) {
      setFailed(true);
      onReady?.(false);
      return;
    }

    const width = mount.clientWidth || 360;
    const height = mount.clientHeight || 260;
    // Capped: a phone at DPR 3 would render nine times the pixels for no
    // visible gain on a decorative scene.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    camera.position.z = 6;

    // Read the brand colour from the theme rather than hardcoding it, so the
    // scene follows if the palette changes.
    const brand = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "#dc2626";
    const brandColor = new THREE.Color(brand);

    const shell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.9, 1),
      new THREE.MeshBasicMaterial({ color: brandColor, wireframe: true, transparent: true, opacity: 0.85 })
    );
    scene.add(shell);

    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.15, 0),
      new THREE.MeshBasicMaterial({ color: brandColor, transparent: true, opacity: 0.12 })
    );
    scene.add(core);

    // Starfield.
    const STAR_COUNT = 420;
    const positions = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 18;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 12;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 12 - 3;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const starMat = new THREE.PointsMaterial({ color: 0x9a9aa6, size: 0.045, transparent: true, opacity: 0.7 });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // Pointer lean, eased so the scene follows rather than snaps.
    const target = { x: 0, y: 0 };
    const onPointer = (e: PointerEvent) => {
      const r = mount.getBoundingClientRect();
      target.x = ((e.clientX - r.left) / r.width - 0.5) * 0.6;
      target.y = ((e.clientY - r.top) / r.height - 0.5) * 0.6;
    };
    window.addEventListener("pointermove", onPointer);

    const onResize = () => {
      const w = mount.clientWidth || width;
      const h = mount.clientHeight || height;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(mount);

    let raf = 0;
    let t = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!still) {
        t += 0.005;
        shell.rotation.x = t * 0.6;
        shell.rotation.y = t;
        core.rotation.y = -t * 0.8;
        stars.rotation.y = t * 0.08;
        // Breathing, so the shell doesn't read as a rigid spinning object.
        const pulse = 1 + Math.sin(t * 2) * 0.03;
        shell.scale.setScalar(pulse);
      }
      scene.rotation.y += (target.x - scene.rotation.y) * 0.05;
      scene.rotation.x += (-target.y - scene.rotation.x) * 0.05;
      renderer.render(scene, camera);
    };
    tick();
    onReady?.(true);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("pointermove", onPointer);
      // Geometries, materials and the context are not garbage-collected on
      // their own; a navigation away would otherwise leak a live GL context.
      shell.geometry.dispose();
      (shell.material as THREE.Material).dispose();
      core.geometry.dispose();
      (core.material as THREE.Material).dispose();
      starGeo.dispose();
      starMat.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [onReady]);

  if (failed) return null;
  return <div ref={mountRef} className="h-[260px] w-full max-w-[420px]" aria-hidden />;
}
