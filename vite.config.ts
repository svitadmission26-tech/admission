import { defineConfig } from 'vite';

export default defineConfig({
	server: {
		host: '0.0.0.0',
		port: 5173,
		allowedHosts: true,
		proxy: {
			'/supabase': {
				target: 'http://127.0.0.1:8000',
				changeOrigin: true,
				ws: true,
				rewrite: (path) => path.replace(/^\/supabase/, ''),
			},
			'/api': {
				target: 'http://127.0.0.1:3001',
				changeOrigin: true,
				ws: true,
			},
		},
	},
});