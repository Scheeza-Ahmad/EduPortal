'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface FinanceOfficer {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  createdAt: string;
}

function getErrorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as AxiosError<{ error?: string }>;
  return axiosErr.response?.data?.error ?? fallback;
}

export default function FinanceOfficerPage() {
  const [officers, setOfficers] = useState<FinanceOfficer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', email: '', password: '' });
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [editTarget, setEditTarget] = useState<FinanceOfficer | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', password: '' });
  const [editError, setEditError] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);

  const [confirmTarget, setConfirmTarget] = useState<{ officer: FinanceOfficer; action: 'deactivate' | 'reactivate' } | null>(
    null
  );
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);

  async function loadOfficers() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ success: boolean; data: { officers: FinanceOfficer[] } }>(
        '/api/admin/finance/users'
      );
      setOfficers(res.data.data.officers);
      setShowCreateForm(res.data.data.officers.length === 0);
    } catch {
      setError('Failed to load finance officers.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOfficers();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreateSuccess(null);
    setSubmitting(true);
    try {
      await api.post('/api/admin/finance/create-user', createForm);
      setCreateSuccess(`Finance officer account created for ${createForm.email}. A welcome email has been sent.`);
      setCreateForm({ name: '', email: '', password: '' });
      setShowCreateForm(false);
      await loadOfficers();
    } catch (err) {
      setCreateError(getErrorMessage(err, 'Failed to create finance officer.'));
    } finally {
      setSubmitting(false);
    }
  }

  function openEdit(officer: FinanceOfficer) {
    setEditTarget(officer);
    setEditForm({ name: officer.name, email: officer.email, password: '' });
    setEditError(null);
  }

  async function handleEditSubmit(e: FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setEditError(null);
    setEditSubmitting(true);
    try {
      await api.patch(`/api/admin/finance/users/${editTarget.id}`, {
        name: editForm.name,
        email: editForm.email,
        password: editForm.password || undefined,
      });
      setEditTarget(null);
      await loadOfficers();
    } catch (err) {
      setEditError(getErrorMessage(err, 'Failed to update finance officer.'));
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleConfirmAction() {
    if (!confirmTarget) return;
    setConfirmSubmitting(true);
    try {
      await api.patch(`/api/admin/finance/users/${confirmTarget.officer.id}/${confirmTarget.action}`);
      setConfirmTarget(null);
      await loadOfficers();
    } catch {
      setError(`Failed to ${confirmTarget.action} finance officer.`);
    } finally {
      setConfirmSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Finance Officer</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Finance officers manage fees, payments, and reports entirely in their own Finance portal.
          </p>
        </div>
        {officers.length > 0 && !showCreateForm && (
          <Button
            onClick={() => {
              setCreateForm({ name: '', email: '', password: '' });
              setCreateError(null);
              setCreateSuccess(null);
              setShowCreateForm(true);
            }}
          >
            + Add Another Finance Officer
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <>
          {officers.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {officers.map((officer) => (
                <Card key={officer.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base">{officer.name}</CardTitle>
                      <Badge variant={officer.isActive ? 'default' : 'secondary'}>
                        {officer.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-sm text-muted-foreground">{officer.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Created {new Date(officer.createdAt).toLocaleDateString()}
                    </p>
                    <div className="flex gap-2 pt-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(officer)}>
                        Edit
                      </Button>
                      {officer.isActive ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setConfirmTarget({ officer, action: 'deactivate' })}
                        >
                          Deactivate
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setConfirmTarget({ officer, action: 'reactivate' })}
                        >
                          Reactivate
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {createSuccess && (
            <div className="rounded-md border border-green-300 bg-green-50 px-4 py-2 text-sm text-green-800">
              {createSuccess}
            </div>
          )}

          {showCreateForm && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Add Finance Officer</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreate} className="max-w-md space-y-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input
                      required
                      value={createForm.name}
                      onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      required
                      value={createForm.email}
                      onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Password</Label>
                    <Input
                      type="password"
                      required
                      minLength={8}
                      value={createForm.password}
                      onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                    />
                  </div>
                  {createError && (
                    <p className="text-sm text-destructive" role="alert">
                      {createError}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button type="submit" disabled={submitting}>
                      {submitting ? 'Creating...' : 'Create Finance Officer'}
                    </Button>
                    {officers.length > 0 && (
                      <Button type="button" variant="outline" onClick={() => setShowCreateForm(false)}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Dialog open={Boolean(editTarget)} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Finance Officer</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                required
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                required
                value={editForm.email}
                onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>New Password (optional)</Label>
              <Input
                type="password"
                minLength={8}
                placeholder="Leave blank to keep current password"
                value={editForm.password}
                onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
              />
            </div>
            {editError && (
              <p className="text-sm text-destructive" role="alert">
                {editError}
              </p>
            )}
            <DialogFooter>
              <Button type="submit" disabled={editSubmitting}>
                {editSubmitting ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(confirmTarget)} onOpenChange={(open) => !open && setConfirmTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmTarget?.action === 'deactivate' ? 'Deactivate' : 'Reactivate'} {confirmTarget?.officer.name}?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {confirmTarget?.action === 'deactivate'
              ? 'They will no longer be able to log in to the Finance portal.'
              : 'They will regain access to the Finance portal.'}
          </p>
          <DialogFooter>
            <Button
              variant={confirmTarget?.action === 'deactivate' ? 'destructive' : 'default'}
              disabled={confirmSubmitting}
              onClick={handleConfirmAction}
            >
              {confirmSubmitting ? 'Saving...' : confirmTarget?.action === 'deactivate' ? 'Deactivate' : 'Reactivate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
