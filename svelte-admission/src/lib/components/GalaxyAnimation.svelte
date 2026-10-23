<script lang="ts">
    import { onMount } from 'svelte';

    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D;
    let stars: Star[] = [];
    let mouse = { x: 0, y: 0 };
    let width: number;
    let height: number;
    let centerX: number;
    let centerY: number;

    class Star {
        x: number = 0;
        y: number = 0;
        z: number = 0;
        angle: number;
        radius: number;
        spin: number;
        size: number;
        color: string;
        opacity: number;

        constructor() {
            this.angle = Math.random() * Math.PI * 2;
            this.radius = Math.random() * (Math.min(width, height) * 0.45);
            // Spiral arm effect: group stars into 3 main arms
            const arm = Math.floor(Math.random() * 3);
            this.angle = (arm * (Math.PI * 2 / 3)) + (Math.random() * 0.5) + (this.radius / 150);
            
            this.spin = (Math.random() * 0.002 + 0.001) * (1 - this.radius / (width * 0.5));
            this.size = Math.random() * 1.5 + 0.5;
            this.opacity = Math.random() * 0.8 + 0.2;
            
            // Subtle color variation (blues and purples for light theme)
            const colors = ['#0d6efd', '#6610f2', '#052c65', '#4a90e2', '#3d8bfd'];
            this.color = colors[Math.floor(Math.random() * colors.length)];
        }

        update() {
            this.angle += this.spin;
            
            // Mouse interaction: slight tilt and offset
            const mouseOffsetX = (mouse.x - centerX) * (this.radius / 1000);
            const mouseOffsetY = (mouse.y - centerY) * (this.radius / 1000);

            this.x = centerX + Math.cos(this.angle) * this.radius + mouseOffsetX;
            this.y = centerY + Math.sin(this.angle) * this.radius * 0.6 + mouseOffsetY; // 0.6 for tilt perspective
        }

        draw() {
            ctx.fillStyle = this.color;
            ctx.globalAlpha = this.opacity;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawCore() {
        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, width * 0.15);
        gradient.addColorStop(0, 'rgba(13, 110, 253, 0.2)');
        gradient.addColorStop(0.5, 'rgba(13, 110, 253, 0.1)');
        gradient.addColorStop(1, 'rgba(13, 110, 253, 0)');
        
        ctx.fillStyle = gradient;
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(centerX, centerY, width * 0.2, 0, Math.PI * 2);
        ctx.fill();
    }

    function init() {
        stars = [];
        centerX = width / 2;
        centerY = height / 2;
        const starCount = Math.floor((width * height) / 800);
        for (let i = 0; i < starCount; i++) {
            stars.push(new Star());
        }
    }

    function animate() {
        ctx.clearRect(0, 0, width, height);
        
        // Draw the galaxy core
        drawCore();
        
        // Draw and update stars
        for (let star of stars) {
            star.update();
            star.draw();
        }
        
        requestAnimationFrame(animate);
    }

    function handleResize() {
        if (!canvas) return;
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
        init();
    }

    onMount(() => {
        ctx = canvas.getContext('2d')!;
        handleResize();
        animate();

        const handleMouseMove = (e: MouseEvent) => {
            mouse.x = e.clientX;
            mouse.y = e.clientY;
        };

        window.addEventListener('resize', handleResize);
        window.addEventListener('mousemove', handleMouseMove);

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('mousemove', handleMouseMove);
        };
    });
</script>

<canvas bind:this={canvas} class="galaxy-canvas"></canvas>

<style>
    .galaxy-canvas {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 1;
    }
</style>
