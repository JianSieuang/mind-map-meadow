import React from "react";
import { GoogleLogin } from "@react-oauth/google";

export default function LoginPage({ onLogin, error }) {
    return (
        <div className="w-screen h-screen bg-[#1e1e24] flex items-center justify-center">
            <div className="w-full max-w-sm p-8 flex flex-col items-center gap-6 rounded-2xl bg-[#23232e]/90 border border-slate-700/60 shadow-[0_0_40px_-10px_rgba(99,102,241,0.35)]">
                <div className="text-center">
                    <h1 className="text-xl font-bold text-white">🌾 Mind Map Meadow</h1>
                    <p className="text-xs text-slate-400 mt-1">Sign in with Google to enter your meadow.</p>
                </div>

                <GoogleLogin onSuccess={onLogin} onError={() => onLogin(null, "Google sign-in failed. Please try again.")} theme="filled_black" shape="pill" />

                {error && <p className="text-xs text-rose-400 text-center">{error}</p>}
            </div>
        </div>
    );
}
