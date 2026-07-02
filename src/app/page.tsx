"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Icon from "@/components/Icon";
import { useAuth } from "@/lib/auth";

export default function Login() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("admin@evaluahealth.mx");
  const [pwd, setPwd] = useState("Admin@123");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const res = await signIn(email.trim(), pwd);
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    router.replace(res.role === "admin" ? "/admin/dashboard" : "/evaluator/evaluate");
  }

  return (
    <div className="auth">
      <div className="auth-side"></div>

      <div className="auth-form">
        <div className="auth-card">
          <Image src="/assets/img/logo-horizontal.png" alt="EvaluaHealth Experts" width={300} height={40} className="wordmark" style={{ height: 40, width: "auto" }} priority />
          <h1>Bienvenido</h1>
          <p className="lead">Inicia sesión en tu espacio de evaluación.</p>
          <form onSubmit={submit}>
            <div className="field">
              <label>Correo electrónico / Número telefónico</label>
              <input className="input" type="text" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label>Contraseña</label>
              <div className="pass-wrap">
                <input className="input" type={show ? "text" : "password"} value={pwd} onChange={(e) => setPwd(e.target.value)} required />
                <button type="button" onClick={() => setShow((s) => !s)}>
                  <Icon name={show ? "eye-off" : "eye"} size={18} />
                </button>
              </div>
            </div>
            {err && <div style={{ color: "#e11d48", fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{err}</div>}
            <button className="btn btn-pri btn-block" type="submit" disabled={busy} style={{ marginTop: 8 }}>
              {busy ? "Iniciando sesión…" : <>Iniciar sesión <Icon name="arrow-right" size={16} /></>}
            </button>
            <a href="#" className="forgot-link" onClick={(e) => e.preventDefault()}>¿Olvidaste tu contraseña?</a>
          </form>
        </div>
      </div>
    </div>
  );
}
