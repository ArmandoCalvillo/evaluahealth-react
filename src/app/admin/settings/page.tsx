"use client";
import { useState } from "react";
import Shell from "@/components/Shell";
import Icon from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/lib/auth";

export default function Settings() {
  const toast = useToast();
  const { profile } = useAuth();
  const [name, setName] = useState(profile?.full_name || "Admin User");
  const [email, setEmail] = useState(profile?.email || "admin@evaluahealth.mx");
  const [next, setNext] = useState("");
  const [retype, setRetype] = useState("");
  const [pErr, setPErr] = useState<Record<string, string>>({});
  const [show, setShow] = useState(false);

  function changePassword() {
    const e: Record<string, string> = {};
    if (!next.trim()) e.next = "New password is required.";
    else if (next.length < 6) e.next = "Password must be at least 6 characters.";
    if (!retype.trim()) e.retype = "Please retype the new password.";
    else if (next && retype !== next) e.retype = "Passwords do not match.";
    if (Object.keys(e).length) { setPErr(e); return; }
    setPErr({});
    toast("Password changed");
    setNext(""); setRetype("");
  }

  return (
    <Shell portal="admin" title="Settings" sub="Account & security">
      <div className="grid g-2">
        <div className="card">
          <div className="card-head"><div><h3>Profile</h3><div className="sub">Your administrator account</div></div></div>
          <div className="card-pad">
            <div className="field"><label>Full Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="field"><label>Email</label><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <button className="btn btn-pri" onClick={() => toast("Profile saved")}><Icon name="check" size={16} /> Save Changes</button>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><div><h3>Change Password</h3><div className="sub">Update your account password</div></div></div>
          <div className="card-pad">
            <div className="field"><label>New Password</label>
              <div className="pass-wrap">
                <input className={`input${pErr.next ? " input-error" : ""}`} type={show ? "text" : "password"} value={next} onChange={(e) => { setNext(e.target.value); if (e.target.value) setPErr((x) => ({ ...x, next: "" })); }} />
                <button type="button" onClick={() => setShow((s) => !s)}><Icon name={show ? "eye-off" : "eye"} size={18} /></button>
              </div>
              {pErr.next && <div className="field-error">{pErr.next}</div>}
            </div>
            <div className="field"><label>Retype New Password</label>
              <input className={`input${pErr.retype ? " input-error" : ""}`} type={show ? "text" : "password"} value={retype} onChange={(e) => { setRetype(e.target.value); if (e.target.value) setPErr((x) => ({ ...x, retype: "" })); }} />
              {pErr.retype && <div className="field-error">{pErr.retype}</div>}
            </div>
            <button className="btn btn-pri" onClick={changePassword}><Icon name="lock" size={16} /> Change Password</button>
          </div>
        </div>
      </div>
    </Shell>
  );
}
