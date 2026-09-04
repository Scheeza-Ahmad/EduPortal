'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AxiosError } from 'axios';
import { ArrowLeft, Lock } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

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
  coordinator: '/coordinator',
};

type RoleValue = keyof typeof ROLE_HOME;
type ColorName = 'purple' | 'blue' | 'green' | 'indigo' | 'orange' | 'yellow' | 'pink';

interface RoleInfo {
  value: RoleValue;
  label: string;
  icon: string;
  description: string;
  loginTitle: string;
  color: ColorName;
}

const ROLES: RoleInfo[] = [
  { value: 'super_admin', label: 'Super Admin', icon: '🛡️', description: 'Platform management', loginTitle: 'Super Admin Login', color: 'purple' },
  { value: 'school_admin', label: 'School Admin', icon: '🏫', description: 'School operations', loginTitle: 'School Admin Login', color: 'blue' },
  { value: 'teacher', label: 'Teacher', icon: '👨‍🏫', description: 'Classes & activities', loginTitle: 'Teacher Login', color: 'green' },
  { value: 'student', label: 'Student', icon: '🎓', description: 'My learning', loginTitle: 'Student Login', color: 'indigo' },
  { value: 'parent', label: 'Parent', icon: '👨‍👩‍👧‍👦', description: "Child's progress", loginTitle: 'Parent Login', color: 'orange' },
  { value: 'finance', label: 'Finance', icon: '💰', description: 'Fees & payments', loginTitle: 'Finance Officer Login', color: 'yellow' },
  { value: 'coordinator', label: 'Coordinator', icon: '🎯', description: 'Wing supervision', loginTitle: 'Coordinator Login', color: 'pink' },
];

// Literal Tailwind class strings (not built dynamically) so the JIT scanner
// picks them all up — a template-string `border-${color}-400` would not.
const COLOR_STYLES: Record<
  ColorName,
  { border: string; iconBg: string; text: string; button: string; ring: string }
> = {
  purple: {
    border: 'border-purple-200 hover:border-purple-400 dark:border-purple-900',
    iconBg: 'bg-purple-100 dark:bg-purple-950',
    text: 'text-purple-600 dark:text-purple-400',
    button: 'bg-purple-600 hover:bg-purple-700',
    ring: 'focus-visible:ring-purple-500',
  },
  blue: {
    border: 'border-blue-200 hover:border-blue-400 dark:border-blue-900',
    iconBg: 'bg-blue-100 dark:bg-blue-950',
    text: 'text-blue-600 dark:text-blue-400',
    button: 'bg-blue-600 hover:bg-blue-700',
    ring: 'focus-visible:ring-blue-500',
  },
  green: {
    border: 'border-green-200 hover:border-green-400 dark:border-green-900',
    iconBg: 'bg-green-100 dark:bg-green-950',
    text: 'text-green-600 dark:text-green-400',
    button: 'bg-green-600 hover:bg-green-700',
    ring: 'focus-visible:ring-green-500',
  },
  indigo: {
    border: 'border-indigo-200 hover:border-indigo-400 dark:border-indigo-900',
    iconBg: 'bg-indigo-100 dark:bg-indigo-950',
    text: 'text-indigo-600 dark:text-indigo-400',
    button: 'bg-indigo-600 hover:bg-indigo-700',
    ring: 'focus-visible:ring-indigo-500',
  },
  orange: {
    border: 'border-orange-200 hover:border-orange-400 dark:border-orange-900',
    iconBg: 'bg-orange-100 dark:bg-orange-950',
    text: 'text-orange-600 dark:text-orange-400',
    button: 'bg-orange-600 hover:bg-orange-700',
    ring: 'focus-visible:ring-orange-500',
  },
  yellow: {
    border: 'border-yellow-200 hover:border-yellow-400 dark:border-yellow-900',
    iconBg: 'bg-yellow-100 dark:bg-yellow-950',
    text: 'text-yellow-700 dark:text-yellow-400',
    button: 'bg-yellow-500 hover:bg-yellow-600',
    ring: 'focus-visible:ring-yellow-500',
  },
  pink: {
    border: 'border-pink-200 hover:border-pink-400 dark:border-pink-900',
    iconBg: 'bg-pink-100 dark:bg-pink-950',
    text: 'text-pink-600 dark:text-pink-400',
    button: 'bg-pink-600 hover:bg-pink-700',
    ring: 'focus-visible:ring-pink-500',
  },
};

type Step = 'role-select' | 'login' | 'forgot-request' | 'forgot-reset';

function roleLabel(role: string): string {
  return ROLES.find((r) => r.value === role)?.label ?? role;
}

// A coordinator is an elevated teacher account — picking "Teacher" on the
// role-select screen and logging in with coordinator credentials is not a
// mismatch, it's the expected path for a promoted teacher.
function rolesCompatible(selected: RoleValue, actual: string): boolean {
  if (selected === actual) return true;
  if (selected === 'teacher' && actual === 'coordinator') return true;
  return false;
}

function getErrorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as AxiosError<{ error?: string }>;
  return axiosErr.response?.data?.error ?? fallback;
}

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);

  const [step, setStep] = useState<Step>('role-select');
  const [selectedRole, setSelectedRole] = useState<RoleInfo>(ROLES[1]);
  const [loginNotice, setLoginNotice] = useState<string | null>(null);

  // --- Login form state ---
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [roleMismatchNotice, setRoleMismatchNotice] = useState<string | null>(null);

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

  const colors = COLOR_STYLES[selectedRole.color];

  function chooseRole(role: RoleInfo) {
    setSelectedRole(role);
    setLoginError(null);
    setEmail('');
    setPassword('');
    setStep('login');
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setLoginError(null);
    setRoleMismatchNotice(null);
    setLoginLoading(true);

    try {
      const res = await api.post<{ success: boolean; data: LoginResponse }>(
        '/api/auth/login',
        { email, password }
      );
      const { accessToken, user } = res.data.data;
      setAuth(accessToken, user);
      const destination = ROLE_HOME[user.role] ?? '/login';

      // The role picked in Step 1 is purely for theming — the backend's
      // actual role from the credentials decides where the user lands. If
      // they don't match, tell the user clearly why they're being sent
      // somewhere other than the portal they clicked, instead of silently
      // redirecting them and letting it look like a bug.
      if (!rolesCompatible(selectedRole.value, user.role)) {
        setRoleMismatchNotice(
          `This account is registered as a ${roleLabel(user.role)}, not a ${selectedRole.label}. Redirecting you to the ${roleLabel(user.role)} portal...`
        );
        setLoginLoading(false);
        setTimeout(() => router.push(destination), 1800);
        return;
      }

      router.push(destination);
    } catch (err) {
      setLoginError(getErrorMessage(err, 'Something went wrong. Please try again.'));
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

  // ---------------------------------------------------------------
  // STEP 1 — Role selection
  // ---------------------------------------------------------------
  if (step === 'role-select') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-3xl text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Welcome to EduPortal</h1>
          <p className="mt-2 text-sm text-muted-foreground">Select your role to continue</p>

          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {ROLES.map((role) => {
              const c = COLOR_STYLES[role.color];
              return (
                <button
                  key={role.value}
                  onClick={() => chooseRole(role)}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-xl border-2 bg-card p-5 text-center transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg',
                    c.border
                  )}
                >
                  <div className={cn('flex h-12 w-12 items-center justify-center rounded-full text-2xl', c.iconBg)}>
                    {role.icon}
                  </div>
                  <span className="text-sm font-semibold">{role.label}</span>
                  <span className="text-xs text-muted-foreground">{role.description}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------
  // STEP 2 — Login / forgot-password forms
  // ---------------------------------------------------------------
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-sm">
        <button
          onClick={() => setStep('role-select')}
          className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Choose a different role
        </button>

        <div className="mb-6 flex items-center gap-3">
          <div className={cn('flex h-11 w-11 items-center justify-center rounded-full text-xl', colors.iconBg)}>
            {selectedRole.icon}
          </div>
          <div>
            <h2 className={cn('text-xl font-semibold tracking-tight', colors.text)}>
              {step === 'login' ? selectedRole.loginTitle : selectedRole.label}
            </h2>
            {step === 'login' && <p className="text-xs text-muted-foreground">Sign in to continue</p>}
          </div>
        </div>

        {step === 'login' && (
          <>
            {loginNotice && (
              <p className="mb-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-400">
                {loginNotice}
              </p>
            )}

            {roleMismatchNotice && (
              <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-400">
                {roleMismatchNotice}
              </p>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={colors.ring}
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
                  className={colors.ring}
                />
              </div>

              {loginError && (
                <p className="text-sm text-destructive" role="alert">
                  {loginError}
                </p>
              )}

              <Button type="submit" className={cn('w-full text-white', colors.button)} disabled={loginLoading}>
                {loginLoading ? 'Signing in...' : 'Sign in'}
              </Button>
            </form>
          </>
        )}

        {step === 'forgot-request' && (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              Enter your account email and we&apos;ll send you a reset code.
            </p>

            <form onSubmit={handleForgotRequest} className="space-y-4">
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

              <Button type="submit" className={cn('w-full text-white', colors.button)} disabled={forgotLoading}>
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
            <p className="mb-4 text-sm text-muted-foreground">
              Enter the 6-digit code and choose a new password.
            </p>

            {forgotNotice && (
              <p className="mb-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-400">
                {forgotNotice}
              </p>
            )}

            <form onSubmit={handleResetPassword} className="space-y-4">
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

              <Button type="submit" className={cn('w-full text-white', colors.button)} disabled={resetLoading}>
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

        <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />
          <span>Accounts are created by your school administrator.</span>
        </div>
      </div>
    </div>
  );
}
