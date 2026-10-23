import { writable } from 'svelte/store';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
    id: number;
    message: string;
    type: ToastType;
    duration?: number;
}

const { subscribe, update } = writable<Toast[]>([]);

let idCounter = 0;

export const toastStore = {
    subscribe,
    add: (message: string, type: ToastType = 'info', duration: number = 3000) => {
        const id = ++idCounter;
        update((toasts) => [...toasts, { id, message, type, duration }]);

        if (duration > 0) {
            setTimeout(() => {
                toastStore.remove(id);
            }, duration);
        }
    },
    remove: (id: number) => {
        update((toasts) => toasts.filter((t) => t.id !== id));
    },
    success: (message: string, duration = 3000) => toastStore.add(message, 'success', duration),
    error: (message: string, duration = 5000) => toastStore.add(message, 'error', duration),
    info: (message: string, duration = 3000) => toastStore.add(message, 'info', duration),
    warning: (message: string, duration = 4000) => toastStore.add(message, 'warning', duration)
};
