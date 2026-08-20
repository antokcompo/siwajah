import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { CheckCircle2, ShieldAlert, AlertTriangle, Info, X } from 'lucide-react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const showToast = useCallback((type = 'info', title, message = '', duration = 4500) => {
    const id = Date.now() + Math.random().toString(36).substring(2, 9)
    const newToast = { id, type, title, message }

    setToasts(prev => [newToast, ...prev.slice(0, 4)]) // Keep max 5 toasts

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id)
      }, duration)
    }
  }, [removeToast])

  const toastSuccess = useCallback((title, message) => showToast('success', title, message), [showToast])
  const toastError = useCallback((title, message) => showToast('error', title, message), [showToast])
  const toastWarning = useCallback((title, message) => showToast('warning', title, message), [showToast])
  const toastInfo = useCallback((title, message) => showToast('info', title, message), [showToast])

  // Attach to window object for global fallback access
  useEffect(() => {
    window.toast = { show: showToast, success: toastSuccess, error: toastError, warning: toastWarning, info: toastInfo }
  }, [showToast, toastSuccess, toastError, toastWarning, toastInfo])

  return (
    <ToastContext.Provider value={{ showToast, toastSuccess, toastError, toastWarning, toastInfo, removeToast }}>
      {children}

      {/* Floating Toast Notification Container */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2.5 max-w-sm sm:max-w-md w-full pointer-events-none px-3">
        {toasts.map(t => {
          let styleConfig = {
            border: 'border-cyan-500/50 shadow-cyan-950/60',
            bgGlow: 'bg-cyan-500/10',
            icon: <Info className="text-cyan-400 shrink-0 mt-0.5" size={20} />,
            titleColor: 'text-cyan-300'
          }

          if (t.type === 'error') {
            styleConfig = {
              border: 'border-rose-500/60 shadow-rose-950/80',
              bgGlow: 'bg-rose-500/10',
              icon: <ShieldAlert className="text-rose-400 shrink-0 mt-0.5" size={20} />,
              titleColor: 'text-rose-300'
            }
          } else if (t.type === 'success') {
            styleConfig = {
              border: 'border-emerald-500/60 shadow-emerald-950/80',
              bgGlow: 'bg-emerald-500/10',
              icon: <CheckCircle2 className="text-emerald-400 shrink-0 mt-0.5" size={20} />,
              titleColor: 'text-emerald-300'
            }
          } else if (t.type === 'warning') {
            styleConfig = {
              border: 'border-amber-500/60 shadow-amber-950/80',
              bgGlow: 'bg-amber-500/10',
              icon: <AlertTriangle className="text-amber-400 shrink-0 mt-0.5" size={20} />,
              titleColor: 'text-amber-300'
            }
          }

          return (
            <div
              key={t.id}
              className={`pointer-events-auto bg-slate-900/95 border backdrop-blur-xl rounded-2xl p-4 shadow-2xl ${styleConfig.border} ${styleConfig.bgGlow} transition-all duration-300 transform translate-y-0 opacity-100 flex items-start gap-3 relative overflow-hidden font-sans`}
            >
              {styleConfig.icon}

              <div className="flex-1 min-w-0 pr-4">
                <div className={`font-bold text-xs ${styleConfig.titleColor}`}>
                  {t.title}
                </div>
                {t.message && (
                  <div className="text-[11px] text-slate-300 mt-0.5 leading-relaxed break-words">
                    {t.message}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => removeToast(t.id)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800/60 transition-colors shrink-0"
              >
                <X size={15} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    // Fallback if rendered outside provider
    return {
      showToast: (t, title, msg) => alert(`${title}: ${msg}`),
      toastSuccess: (title, msg) => alert(`${title}: ${msg}`),
      toastError: (title, msg) => alert(`${title}: ${msg}`),
      toastWarning: (title, msg) => alert(`${title}: ${msg}`),
      toastInfo: (title, msg) => alert(`${title}: ${msg}`),
    }
  }
  return ctx
}
