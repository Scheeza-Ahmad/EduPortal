'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AxiosError } from 'axios';
import { ShieldCheck, Lock, Users, Zap } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface LoginResponse {
  accessToken: string;
  user: { id: string; name: string; role: string };
}

const ROLE_HOME: Record<string, string> = {
  super_admin: '/super-admin',
  school_admin: '/admin',
  teacher: '/teacher',
  student: '/student',
  parent: '/parent',
  finance: '/finance',
};

const FEATURES = [
  { icon: ShieldCheck, label: 'Secure', text: 'JWT auth, encrypted passwords, audit-logged actions' },
  { icon: Users, label: 'Role-based', text: 'Tailored access for admins, teachers, students & parents' },
  { icon: Zap, label: 'Automated', text: 'Attendance alerts, reminders, and reports on autopilot' },
];

type Step = 'login' | 'forgot-request' | 'forgot-reset';

function getErrorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as AxiosError<{ error?: string }>;
  return axiosErr.response?.data?.error ?? fallback;
}

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);

  const [step, setStep] = useState<Step>('login');
  const [loginNotice, setLoginNotice] = useState<string | null>(null);

  // --- Login form state ---
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  // --- Forgot password: request code state ---
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotNotice, setForgotNotice] = useState<string | null>(null);

  // --- Forgot password: reset with OTP state ---
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setLoginError(null);
    setLoginLoading(true);

    try {
      const res = await api.post<{ success: boolean; data: LoginResponse }>(
        '/api/auth/login',
        { email, password }
      );
      const { accessToken, user } = res.data.data;
      setAuth(accessToken, user);
      router.push(ROLE_HOME[user.role] ?? '/login');
    } catch (err) {
      setLoginError(getErrorMessage(err, 'Something went wrong. Please try again.'));
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleForgotRequest(e: FormEvent) {
    e.preventDefault();
    setForgotError(null);
    setForgotLoading(true);

    try {
      await api.post('/api/auth/forgot-password', { email: forgotEmail });
      setForgotNotice('If that email exists, a reset code has been sent.');
      setStep('forgot-reset');
    } catch (err) {
      setForgotError(getErrorMessage(err, 'Something went wrong. Please try again.'));
    } finally {
      setForgotLoading(false);
    }
  }

  async function handleResetPassword(e: FormEvent) {
    e.preventDefault();
    setResetError(null);

    if (newPassword !== confirmPassword) {
      setResetError('Passwords do not match.');
      return;
    }

    setResetLoading(true);
    try {
      await api.post('/api/auth/reset-password', {
        email: forgotEmail,
        otp,
        newPassword,
      });

      // Reset all forgot-password state and go back to login with a success notice.
      setStep('login');
      setLoginNotice('Password reset successful. Please sign in with your new password.');
      setEmail(forgotEmail);
      setForgotEmail('');
      setForgotNotice(null);
      setOtp('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setResetError(getErrorMessage(err, 'Something went wrong. Please try again.'));
    } finally {
      setResetLoading(false);
    }
  }

  function backToLogin() {
    setStep('login');
    setForgotError(null);
    setForgotNotice(null);
  }

  return (
    <div className="flex min-h-screen">
      {/* Left branding panel — 60% */}
      <div className="hidden w-3/5 flex-col justify-between bg-slate-900 p-12 text-slate-50 lg:flex">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-7 w-7 text-slate-100" strokeWidth={2} />
          <span className="text-xl font-semibold tracking-tight">EduPortal</span>
        </div>

        <div className="max-w-md">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">
            Empowering Education, Simplifying Management
          </h1>

          <div className="mt-10 space-y-6">
            {FEATURES.map(({ icon: Icon, label, text }) => (
              <div key={label} className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-800">
                  <Icon className="h-4 w-4 text-slate-200" strokeWidth={2} />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-100">{label}</p>
                  <p className="text-sm text-slate-400">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-slate-500">
          &copy; {new Date().getFullYear()} EduPortal. All rights reserved.
        </p>
      </div>

      {/* Right form panel — 40% */}
      <div className="flex w-full flex-col items-center justify-center bg-background px-6 py-12 lg:w-2/5">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <ShieldCheck className="h-6 w-6 text-slate-900" strokeWidth={2} />
            <span className="text-lg font-semibold tracking-tight">EduPortal</span>
          </div>

          {step === 'login' && (
            <>
              <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter your credentials to access your account.
              </p>

              {loginNotice && (
                <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
                  {loginNotice}
                </p>
              )}

              <form onSubmit={handleLogin} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <button
                      type="button"
                      onClick={() => setStep('forgot-request')}
                      className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                {loginError && (
                  <p className="text-sm text-destructive" role="alert">
                    {loginError}
                  </p>
                )}

                <Button type="submit" className="w-full" disabled={loginLoading}>
                  {loginLoading ? 'Signing in...' : 'Sign in'}
                </Button>
              </form>
            </>
          )}

          {step === 'forgot-request' && (
            <>
              <h2 className="text-2xl font-semibold tracking-tight">Reset your password</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter your account email and we&apos;ll send you a reset code.
              </p>

              <form onSubmit={handleForgotRequest} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="forgot-email">Email</Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                  />
                </div>

                {forgotError && (
                  <p className="text-sm text-destructive" role="alert">
                    {forgotError}
                  </p>
                )}

                <Button type="submit" className="w-full" disabled={forgotLoading}>
                  {forgotLoading ? 'Sending...' : 'Send reset code'}
                </Button>

                <button
                  type="button"
                  onClick={backToLogin}
                  className="w-full text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Back to sign in
                </button>
              </form>
            </>
          )}

          {step === 'forgot-reset' && (
            <>
              <h2 className="text-2xl font-semibold tracking-tight">Enter reset code</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter the 6-digit code and choose a new password.
              </p>

              {forgotNotice && (
                <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
                  {forgotNotice}
                </p>
              )}

              <form onSubmit={handleResetPassword} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="otp">Reset code</Label>
                  <Input
                    id="otp"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-password">New password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm new password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>

                {resetError && (
                  <p className="text-sm text-destructive" role="alert">
                    {resetError}
                  </p>
                )}

                <Button type="submit" className="w-full" disabled={resetLoading}>
                  {resetLoading ? 'Resetting...' : 'Reset password'}
                </Button>

                <button
                  type="button"
                  onClick={backToLogin}
                  className="w-full text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Back to sign in
                </button>
              </form>
            </>
          )}

          <div className="mt-6 flex items-center gap-1.5 text-xs text-muted-foreground lg:hidden">
            <Lock className="h-3.5 w-3.5" />
            <span>Accounts are created by your school administrator.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
