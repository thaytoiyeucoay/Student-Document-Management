import { toast as hotToast, type ToastOptions } from 'react-hot-toast'

const base: ToastOptions = {
  duration: 2500,
}

export const toast = {
  success(message: string, opts?: ToastOptions) {
    return hotToast.success(message, { ...base, ...opts })
  },
  error(message: string, opts?: ToastOptions) {
    return hotToast.error(message, { ...base, ...opts })
  },
  info(message: string, opts?: ToastOptions) {
    return hotToast(message, { ...base, ...opts })
  }
}
