'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface School {
  id: string;
  name: string;
  city: string;
  phone: string | null;
  adminId: string | null;
  admin: { id: string; name: string; email: string } | null;
  isActive: boolean;
  featureParentPortal: boolean;
  featureAi: boolean;
  featureSms: boolean;
  featureUrdu: boolean;
}

interface FormState {
  name: string;
  city: string;
  phone: string;
  featureParentPortal: boolean;
  featureAi: boolean;
  featureSms: boolean;
  featureUrdu: boolean;
}

const EMPTY_FORM: FormState = {
  name: '',
  city: '',
  phone: '',
  featureParentPortal: false,
  featureAi: false,
  featureSms: false,
  featureUrdu: false,
};

interface ExistingUser {
  id: string;
  name: string;
  email: string;
  role: string;
  schoolId: string | null;
}

interface CreateAdminForm {
  name: string;
  email: string;
  password: string;
}

const EMPTY_CREATE_ADMIN_FORM: CreateAdminForm = { name: '', email: '', password: '' };

export default function SchoolsPage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSchool, setEditingSchool] = useState<School | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignSchool, setAssignSchool] = useState<School | null>(null);

  const [createAdminForm, setCreateAdminForm] = useState<CreateAdminForm>(EMPTY_CREATE_ADMIN_FORM);
  const [createAdminError, setCreateAdminError] = useState<string | null>(null);
  const [createAdminSubmitting, setCreateAdminSubmitting] = useState(false);

  const [existingUsers, setExistingUsers] = useState<ExistingUser[]>([]);
  const [existingUsersLoading, setExistingUsersLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [assignExistingError, setAssignExistingError] = useState<string | null>(null);
  const [assignExistingSubmitting, setAssignExistingSubmitting] = useState(false);

  async function loadSchools() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ success: boolean; data: { schools: School[] } }>(
        '/api/super/schools?limit=100'
      );
      setSchools(res.data.data.schools);
    } catch {
      setError('Failed to load schools.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSchools();
  }, []);

  function openAddDialog() {
    setEditingSchool(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setDialogOpen(true);
  }

  function openEditDialog(school: School) {
    setEditingSchool(school);
    setForm({
      name: school.name,
      city: school.city,
      phone: school.phone ?? '',
      featureParentPortal: school.featureParentPortal,
      featureAi: school.featureAi,
      featureSms: school.featureSms,
      featureUrdu: school.featureUrdu,
    });
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      if (editingSchool) {
        await api.patch(`/api/super/schools/${editingSchool.id}`, {
          name: form.name,
          city: form.city,
          phone: form.phone || undefined,
          featureParentPortal: form.featureParentPortal,
          featureAi: form.featureAi,
          featureSms: form.featureSms,
          featureUrdu: form.featureUrdu,
        });
      } else {
        await api.post('/api/super/schools', {
          name: form.name,
          city: form.city,
          phone: form.phone || undefined,
        });
      }
      setDialogOpen(false);
      await loadSchools();
    } catch (err) {
      const axiosErr = err as AxiosError<{ error?: string }>;
      setFormError(axiosErr.response?.data?.error ?? 'Failed to save school.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActive(school: School) {
    setTogglingId(school.id);
    try {
      if (school.isActive) {
        await api.delete(`/api/super/schools/${school.id}`);
      } else {
        await api.patch(`/api/super/schools/${school.id}`, { isActive: true });
      }
      await loadSchools();
    } catch {
      setError('Failed to update school status.');
    } finally {
      setTogglingId(null);
    }
  }

  async function openAssignDialog(school: School) {
    setAssignSchool(school);
    setCreateAdminForm(EMPTY_CREATE_ADMIN_FORM);
    setCreateAdminError(null);
    setSelectedUserId('');
    setAssignExistingError(null);
    setAssignDialogOpen(true);

    setExistingUsersLoading(true);
    try {
      const res = await api.get<{ success: boolean; data: { users: ExistingUser[] } }>(
        '/api/super/users?role=school_admin'
      );
      setExistingUsers(res.data.data.users);
    } catch {
      setExistingUsers([]);
    } finally {
      setExistingUsersLoading(false);
    }
  }

  async function handleCreateAdminSubmit(e: FormEvent) {
    e.preventDefault();
    if (!assignSchool) return;
    setCreateAdminError(null);
    setCreateAdminSubmitting(true);

    try {
      await api.post(`/api/super/schools/${assignSchool.id}/admin/create`, createAdminForm);
      setAssignDialogOpen(false);
      await loadSchools();
    } catch (err) {
      const axiosErr = err as AxiosError<{ error?: string }>;
      setCreateAdminError(axiosErr.response?.data?.error ?? 'Failed to create admin.');
    } finally {
      setCreateAdminSubmitting(false);
    }
  }

  async function handleAssignExistingSubmit(e: FormEvent) {
    e.preventDefault();
    if (!assignSchool || !selectedUserId) return;
    setAssignExistingError(null);
    setAssignExistingSubmitting(true);

    try {
      await api.patch(`/api/super/schools/${assignSchool.id}/admin`, { userId: selectedUserId });
      setAssignDialogOpen(false);
      await loadSchools();
    } catch (err) {
      const axiosErr = err as AxiosError<{ error?: string }>;
      setAssignExistingError(axiosErr.response?.data?.error ?? 'Failed to assign admin.');
    } finally {
      setAssignExistingSubmitting(false);
    }
  }

  function activeFeatures(school: School): string[] {
    const features: string[] = [];
    if (school.featureParentPortal) features.push('Parent Portal');
    if (school.featureAi) features.push('AI');
    if (school.featureSms) features.push('SMS');
    if (school.featureUrdu) features.push('Urdu');
    return features;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Schools</h1>
        <Button onClick={openAddDialog}>Add School</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Schools</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading schools...</p>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Features</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schools.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No schools yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  schools.map((school) => (
                    <TableRow key={school.id}>
                      <TableCell className="font-medium">{school.name}</TableCell>
                      <TableCell>{school.city}</TableCell>
                      <TableCell>
                        {school.admin ? (
                          <span>{school.admin.name}</span>
                        ) : (
                          <span className="text-muted-foreground">Not assigned</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={school.isActive ? 'default' : 'secondary'}>
                          {school.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {activeFeatures(school).length === 0 ? (
                            <span className="text-xs text-muted-foreground">None</span>
                          ) : (
                            activeFeatures(school).map((f) => (
                              <Badge key={f} variant="outline" className="text-xs">
                                {f}
                              </Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button variant="outline" size="sm" onClick={() => openEditDialog(school)}>
                          Edit
                        </Button>
                        <Button
                          variant={school.admin ? 'outline' : 'default'}
                          size="sm"
                          onClick={() => openAssignDialog(school)}
                        >
                          {school.admin ? 'Change Admin' : 'Assign Admin'}
                        </Button>
                        <Button
                          variant={school.isActive ? 'destructive' : 'default'}
                          size="sm"
                          disabled={togglingId === school.id}
                          onClick={() => handleToggleActive(school)}
                        >
                          {togglingId === school.id
                            ? '...'
                            : school.isActive
                              ? 'Disable'
                              : 'Enable'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSchool ? 'Edit School' : 'Add School'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="school-name">Name</Label>
              <Input
                id="school-name"
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="school-city">City</Label>
              <Input
                id="school-city"
                required
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="school-phone">Phone (optional)</Label>
              <Input
                id="school-phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>

            {editingSchool && (
              <div className="space-y-3 border-t pt-4">
                <p className="text-sm font-medium">Features</p>

                <div className="flex items-center justify-between">
                  <Label htmlFor="feature-parent-portal" className="font-normal">
                    Parent Portal
                  </Label>
                  <Switch
                    id="feature-parent-portal"
                    checked={form.featureParentPortal}
                    onCheckedChange={(checked) =>
                      setForm((f) => ({ ...f, featureParentPortal: checked }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="feature-ai" className="font-normal">
                    AI Features
                  </Label>
                  <Switch
                    id="feature-ai"
                    checked={form.featureAi}
                    onCheckedChange={(checked) => setForm((f) => ({ ...f, featureAi: checked }))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="feature-sms" className="font-normal">
                    SMS Notifications
                  </Label>
                  <Switch
                    id="feature-sms"
                    checked={form.featureSms}
                    onCheckedChange={(checked) => setForm((f) => ({ ...f, featureSms: checked }))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="feature-urdu" className="font-normal">
                    Urdu Language
                  </Label>
                  <Switch
                    id="feature-urdu"
                    checked={form.featureUrdu}
                    onCheckedChange={(checked) => setForm((f) => ({ ...f, featureUrdu: checked }))}
                  />
                </div>
              </div>
            )}

            {formError && (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            )}

            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving...' : editingSchool ? 'Save Changes' : 'Create School'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Admin{assignSchool ? ` — ${assignSchool.name}` : ''}</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="create">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="create">Create New Admin</TabsTrigger>
              <TabsTrigger value="existing">Assign Existing User</TabsTrigger>
            </TabsList>

            <TabsContent value="create" className="pt-2">
              <form onSubmit={handleCreateAdminSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="admin-name">Name</Label>
                  <Input
                    id="admin-name"
                    required
                    value={createAdminForm.name}
                    onChange={(e) =>
                      setCreateAdminForm((f) => ({ ...f, name: e.target.value }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="admin-email">Email</Label>
                  <Input
                    id="admin-email"
                    type="email"
                    required
                    value={createAdminForm.email}
                    onChange={(e) =>
                      setCreateAdminForm((f) => ({ ...f, email: e.target.value }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="admin-password">Password</Label>
                  <Input
                    id="admin-password"
                    type="password"
                    required
                    minLength={8}
                    value={createAdminForm.password}
                    onChange={(e) =>
                      setCreateAdminForm((f) => ({ ...f, password: e.target.value }))
                    }
                  />
                </div>

                {createAdminError && (
                  <p className="text-sm text-destructive" role="alert">
                    {createAdminError}
                  </p>
                )}

                <DialogFooter>
                  <Button type="submit" disabled={createAdminSubmitting}>
                    {createAdminSubmitting ? 'Creating...' : 'Create & Assign'}
                  </Button>
                </DialogFooter>
              </form>
            </TabsContent>

            <TabsContent value="existing" className="pt-2">
              <form onSubmit={handleAssignExistingSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>School Admin User</Label>
                  <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          existingUsersLoading ? 'Loading...' : 'Select an existing user'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {existingUsers.length === 0 ? (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                          No existing school_admin users found.
                        </div>
                      ) : (
                        existingUsers.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.name} ({u.email}){u.schoolId ? ' — currently assigned' : ''}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {assignExistingError && (
                  <p className="text-sm text-destructive" role="alert">
                    {assignExistingError}
                  </p>
                )}

                <DialogFooter>
                  <Button type="submit" disabled={assignExistingSubmitting || !selectedUserId}>
                    {assignExistingSubmitting ? 'Assigning...' : 'Assign'}
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
