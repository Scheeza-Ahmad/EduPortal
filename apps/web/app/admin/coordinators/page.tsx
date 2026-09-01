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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Wing = 'junior' | 'senior';

interface Coordinator {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  createdAt: string;
  wingLabel: string | null;
  classes: string[];
  teacherProfile: { coordinatorWing: Wing | null } | null;
}

interface TeacherOption {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  teacherProfile: { isCoordinator: boolean } | null;
}

function getErrorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as AxiosError<{ error?: string }>;
  return axiosErr.response?.data?.error ?? fallback;
}

function WingRadio({ value, onChange }: { value: Wing | ''; onChange: (v: Wing) => void }) {
  return (
    <div className="flex gap-6">
      {(['junior', 'senior'] as Wing[]).map((w) => (
        <label key={w} className="flex items-center gap-2 text-sm">
          <input type="radio" name="wing" checked={value === w} onChange={() => onChange(w)} />
          {w === 'junior' ? 'Junior Wing (1-5)' : 'Senior Wing (6-10)'}
        </label>
      ))}
    </div>
  );
}

export default function CoordinatorsPage() {
  const [coordinators, setCoordinators] = useState<Coordinator[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);

  const [promoteUserId, setPromoteUserId] = useState('');
  const [promoteWing, setPromoteWing] = useState<Wing | ''>('');
  const [promoteError, setPromoteError] = useState<string | null>(null);
  const [promoting, setPromoting] = useState(false);

  const [createForm, setCreateForm] = useState({ name: '', email: '', password: '' });
  const [createWing, setCreateWing] = useState<Wing | ''>('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [removingId, setRemovingId] = useState<string | null>(null);

  async function loadCoordinators() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ success: boolean; data: { coordinators: Coordinator[] } }>(
        '/api/admin/coordinators'
      );
      setCoordinators(res.data.data.coordinators);
    } catch {
      setError('Failed to load coordinators.');
    } finally {
      setLoading(false);
    }
  }

  async function loadTeachers() {
    try {
      const res = await api.get<{ success: boolean; data: { teachers: TeacherOption[] } }>('/api/admin/teachers');
      setTeachers(res.data.data.teachers.filter((t) => t.isActive && !t.teacherProfile?.isCoordinator));
    } catch {
      // Non-fatal — the promote dropdown will just be empty.
    }
  }

  useEffect(() => {
    loadCoordinators();
    loadTeachers();
  }, []);

  function openDialog(wing?: Wing) {
    setPromoteUserId('');
    setPromoteWing(wing ?? '');
    setPromoteError(null);
    setCreateForm({ name: '', email: '', password: '' });
    setCreateWing(wing ?? '');
    setCreateError(null);
    setSuccessMsg(null);
    setDialogOpen(true);
  }

  async function handlePromote(e: FormEvent) {
    e.preventDefault();
    if (!promoteUserId || !promoteWing) return;
    setPromoteError(null);
    setPromoting(true);
    try {
      await api.post('/api/admin/coordinators', { userId: promoteUserId, coordinatorWing: promoteWing });
      setDialogOpen(false);
      setSuccessMsg('Coordinator assigned successfully.');
      await Promise.all([loadCoordinators(), loadTeachers()]);
    } catch (err) {
      setPromoteError(getErrorMessage(err, 'Failed to assign coordinator.'));
    } finally {
      setPromoting(false);
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!createWing) return;
    setCreateError(null);
    setCreating(true);
    try {
      await api.post('/api/admin/coordinators', { ...createForm, coordinatorWing: createWing });
      setDialogOpen(false);
      setSuccessMsg('Coordinator created successfully.');
      await Promise.all([loadCoordinators(), loadTeachers()]);
    } catch (err) {
      setCreateError(getErrorMessage(err, 'Failed to create coordinator.'));
    } finally {
      setCreating(false);
    }
  }

  async function handleRemove(coordinator: Coordinator) {
    setRemovingId(coordinator.id);
    setError(null);
    try {
      await api.delete(`/api/admin/coordinators/${coordinator.id}`);
      setSuccessMsg('Coordinator removed.');
      await Promise.all([loadCoordinators(), loadTeachers()]);
    } catch {
      setError('Failed to remove coordinator.');
    } finally {
      setRemovingId(null);
    }
  }

  function coordinatorForWing(wing: Wing): Coordinator | undefined {
    return coordinators.find((c) => c.teacherProfile?.coordinatorWing === wing);
  }

  function renderWingCard(wing: Wing) {
    const coordinator = coordinatorForWing(wing);
    const label = wing === 'junior' ? 'Junior Wing Coordinator' : 'Senior Wing Coordinator';
    const classRange = wing === 'junior' ? 'Class 1-5' : 'Class 6-10';

    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{label}</CardTitle>
        </CardHeader>
        <CardContent>
          {coordinator ? (
            <div className="space-y-2">
              <div className="text-sm font-medium">{coordinator.name}</div>
              <div className="text-sm text-muted-foreground">{coordinator.email}</div>
              <div className="text-xs text-muted-foreground">
                Assigned since {new Date(coordinator.createdAt).toLocaleDateString()}
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Badge variant="outline">Classes in {classRange}</Badge>
                {coordinator.classes.length > 0 && (
                  <span className="text-xs text-muted-foreground">{coordinator.classes.join(', ')}</span>
                )}
              </div>
              <Button
                variant="destructive"
                size="sm"
                disabled={removingId === coordinator.id}
                onClick={() => handleRemove(coordinator)}
              >
                {removingId === coordinator.id ? 'Removing...' : 'Remove'}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">No coordinator assigned</p>
              <Button size="sm" onClick={() => openDialog(wing)}>
                Assign Now
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Coordinators</h1>
        <Button onClick={() => openDialog()}>+ Add Coordinator</Button>
      </div>

      {successMsg && (
        <div className="rounded-md border border-green-300 bg-green-50 px-4 py-2 text-sm text-green-800">
          {successMsg}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {renderWingCard('junior')}
          {renderWingCard('senior')}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Coordinator</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="promote">
            <TabsList>
              <TabsTrigger value="promote">Promote Existing Teacher</TabsTrigger>
              <TabsTrigger value="create">Create New Coordinator</TabsTrigger>
            </TabsList>

            <TabsContent value="promote" className="pt-4">
              <form onSubmit={handlePromote} className="space-y-4">
                <div className="space-y-2">
                  <Label>Teacher</Label>
                  <Select value={promoteUserId} onValueChange={setPromoteUserId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a teacher" />
                    </SelectTrigger>
                    <SelectContent>
                      {teachers.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name} ({t.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {teachers.length === 0 && (
                    <p className="text-xs text-muted-foreground">No eligible teachers available.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Wing</Label>
                  <WingRadio value={promoteWing} onChange={setPromoteWing} />
                </div>
                {promoteError && (
                  <p className="text-sm text-destructive" role="alert">
                    {promoteError}
                  </p>
                )}
                <DialogFooter>
                  <Button type="submit" disabled={!promoteUserId || !promoteWing || promoting}>
                    {promoting ? 'Assigning...' : 'Assign as Coordinator'}
                  </Button>
                </DialogFooter>
              </form>
            </TabsContent>

            <TabsContent value="create" className="pt-4">
              <form onSubmit={handleCreate} className="space-y-4">
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
                <div className="space-y-2">
                  <Label>Wing</Label>
                  <WingRadio value={createWing} onChange={setCreateWing} />
                </div>
                {createError && (
                  <p className="text-sm text-destructive" role="alert">
                    {createError}
                  </p>
                )}
                <DialogFooter>
                  <Button type="submit" disabled={!createWing || creating}>
                    {creating ? 'Creating...' : 'Create Coordinator'}
                  </Button>
                </DialogFooter>
              </form>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
