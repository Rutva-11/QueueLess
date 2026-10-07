import React, { useEffect, useRef } from "react";
import { Renderer, Camera, Geometry, Program, Mesh } from "ogl";
import "./Particles.css";

// Subtle, warm paper-grain & star tones — off-white and muted charcoal, zero neon
const warmAtmosphericColors = ["#f1f0ea", "#e5e3dc", "#c5c3bc", "#9a9890"];

function hexToRgb(hex) {
    const clean = hex.replace("#", "");
    const bigint = parseInt(clean, 16);
    const r = ((bigint >> 16) & 255) / 255;
    const g = ((bigint >> 8) & 255) / 255;
    const b = (bigint & 255) / 255;
    return [r, g, b];
}

const vertexShader = `
attribute vec3 position;
attribute vec4 color;
attribute float size;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

varying vec4 vColor;

void main() {
    vColor = color;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    // Pinprick sizes (1px to 2px maximum screen space)
    gl_PointSize = clamp(size * (14.0 / -mvPosition.z), 1.0, 2.0);
    gl_Position = projectionMatrix * mvPosition;
}
`;

const fragmentShader = `
precision highp float;
varying vec4 vColor;

void main() {
    // Sharp, delicate circular point
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);
    if (dist > 0.5) discard;
    float alpha = smoothstep(0.5, 0.25, dist) * vColor.a;
    gl_FragColor = vec4(vColor.rgb, alpha);
}
`;

export default function Particles({
    particleCount = 55,
    particleSpread = 18,
    speed = 0.015,
    particleColors = warmAtmosphericColors,
    moveParticlesOnHover = true,
    particleHoverFactor = 0.12,
    alphaParticles = true,
    particleBaseSize = 1.3,
    sizeRandomness = 0.4,
    cameraDistance = 20,
    disableRotation = false,
    className = ""
}) {
    const containerRef = useRef(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const renderer = new Renderer({
            depth: false,
            alpha: true,
            antialias: true,
            dpr: Math.min(window.devicePixelRatio || 1, 2)
        });
        const gl = renderer.gl;
        container.appendChild(gl.canvas);
        gl.clearColor(0, 0, 0, 0);

        const camera = new Camera(gl, { fov: 45 });
        camera.position.z = cameraDistance;

        function resize() {
            if (!container) return;
            const width = container.clientWidth;
            const height = container.clientHeight;
            renderer.setSize(width, height);
            camera.perspective({ aspect: width / height });
        }
        resize();
        window.addEventListener("resize", resize);

        // Generate tiny, sparse particle positions
        const count = particleCount;
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 4);
        const sizes = new Float32Array(count);
        const velocities = new Float32Array(count * 3);

        const parsedColors = particleColors.map(hexToRgb);

        for (let i = 0; i < count; i++) {
            positions[i * 3 + 0] = (Math.random() - 0.5) * particleSpread * 2;
            positions[i * 3 + 1] = (Math.random() - 0.5) * particleSpread * 2;
            positions[i * 3 + 2] = (Math.random() - 0.5) * particleSpread * 2;

            velocities[i * 3 + 0] = (Math.random() - 0.5) * 0.002 * speed * 10;
            velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.002 * speed * 10;
            velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.002 * speed * 10;

            const rgb = parsedColors[Math.floor(Math.random() * parsedColors.length)];
            // Delicate, calm opacity
            const alpha = alphaParticles ? Math.random() * 0.25 + 0.12 : 0.25;
            colors[i * 4 + 0] = rgb[0];
            colors[i * 4 + 1] = rgb[1];
            colors[i * 4 + 2] = rgb[2];
            colors[i * 4 + 3] = alpha;

            const randomFactor = 1 - sizeRandomness + Math.random() * sizeRandomness;
            sizes[i] = particleBaseSize * randomFactor;
        }

        const geometry = new Geometry(gl, {
            position: { size: 3, data: positions },
            color: { size: 4, data: colors },
            size: { size: 1, data: sizes }
        });

        const program = new Program(gl, {
            vertex: vertexShader,
            fragment: fragmentShader,
            transparent: true,
            depthTest: false
        });

        const points = new Mesh(gl, { mode: gl.POINTS, geometry, program });

        let mouseX = 0;
        let mouseY = 0;
        let targetX = 0;
        let targetY = 0;

        const onMouseMove = (e) => {
            if (!moveParticlesOnHover) return;
            const x = (e.clientX / window.innerWidth) * 2 - 1;
            const y = -(e.clientY / window.innerHeight) * 2 + 1;
            targetX = x * particleHoverFactor;
            targetY = y * particleHoverFactor;
        };

        if (moveParticlesOnHover) {
            window.addEventListener("mousemove", onMouseMove);
        }

        let animationFrameId;

        function update() {
            animationFrameId = requestAnimationFrame(update);

            mouseX += (targetX - mouseX) * 0.015;
            mouseY += (targetY - mouseY) * 0.015;

            if (!disableRotation) {
                points.rotation.y += 0.004 * speed;
                points.rotation.x = mouseY * 0.03;
                points.rotation.y += mouseX * 0.003;
            }

            const posArray = geometry.attributes.position.data;
            const halfSpread = particleSpread;
            for (let i = 0; i < count; i++) {
                posArray[i * 3 + 0] += velocities[i * 3 + 0];
                posArray[i * 3 + 1] += velocities[i * 3 + 1];
                posArray[i * 3 + 2] += velocities[i * 3 + 2];

                if (posArray[i * 3 + 0] > halfSpread) posArray[i * 3 + 0] = -halfSpread;
                if (posArray[i * 3 + 0] < -halfSpread) posArray[i * 3 + 0] = halfSpread;
                if (posArray[i * 3 + 1] > halfSpread) posArray[i * 3 + 1] = -halfSpread;
                if (posArray[i * 3 + 1] < -halfSpread) posArray[i * 3 + 1] = halfSpread;
            }
            geometry.attributes.position.needsUpdate = true;

            renderer.render({ scene: points, camera });
        }

        animationFrameId = requestAnimationFrame(update);

        return () => {
            cancelAnimationFrame(animationFrameId);
            window.removeEventListener("resize", resize);
            if (moveParticlesOnHover) {
                window.removeEventListener("mousemove", onMouseMove);
            }
            if (gl.canvas && gl.canvas.parentNode === container) {
                container.removeChild(gl.canvas);
            }
        };
    }, [
        particleCount,
        particleSpread,
        speed,
        particleColors,
        moveParticlesOnHover,
        particleHoverFactor,
        alphaParticles,
        particleBaseSize,
        sizeRandomness,
        cameraDistance,
        disableRotation
    ]);

    return <div ref={containerRef} className={`react-bits-particles-container ${className}`} />;
}
