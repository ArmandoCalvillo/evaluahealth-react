"use client";
import { createContext, useContext, useState, useCallback } from "react";
import Icon from "./Icon";

interface ToastItem { id: number; msg: string; icon: string }
interface ToastCtx { toast: (msg: string, icon?: string) => void }

const Ctx = createContext<ToastCtx>({ toast: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const toast = useCallback((msg: string, icon = "check-circle-2") => {
    const id = Date.now() + Math.random();
    setItems((p) => [...p, { id, msg, icon }]);
    setTimeout(() => setItems((p) => p.filter((t) => t.id !== id)), 2800);
  }, []);
  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="toast-wrap">
        {items.map((t) => (
          <div className="toast" key={t.id}>
            <Icon name={t.icon} size={18} /> {t.msg}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx).toast;
