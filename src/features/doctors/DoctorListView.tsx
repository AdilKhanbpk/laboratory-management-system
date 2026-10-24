import React, { useState, useEffect, useCallback } from 'react';
import { Doctor } from '../../types';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { DoctorFormModal } from './DoctorFormModal';
import {
  Stethoscope,
  UserPlus,
  Search,
  Filter,
  Edit2,
  PowerOff,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';

export const DoctorListView: React.FC = () => {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [isLoading, setIsLoading] = useState(false);

  // Modal
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [doctorToEdit, setDoctorToEdit] = useState<Doctor | null>(null);

  const fetchDoctors = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await window.electronAPI.doctors.list({
        search: searchQuery,
        includeInactive: statusFilter === 'all' || statusFilter === 'inactive',
      });

      if (res.success && res.data) {
        let list = res.data;
        if (statusFilter === 'inactive') {
          list = list.filter((d) => d.is_active === 0);
        } else if (statusFilter === 'active') {
          list = list.filter((d) => d.is_active === 1);
        }
        setDoctors(list);
      }
    } catch (err) {
      console.error('Failed to list doctors:', err);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, statusFilter]);

  useEffect(() => {
    fetchDoctors();
  }, [fetchDoctors]);

  const handleToggleActive = async (doctor: Doctor) => {
    const willDeactivate = doctor.is_active === 1;
    const confirmMessage = willDeactivate
      ? `Deactivate ${doctor.full_name}?\n\nThey will be hidden from new test orders, but all historical medical records and invoices referencing this doctor will be preserved.`
      : `Reactivate ${doctor.full_name} to appear in new referral selections?`;

    if (!window.confirm(confirmMessage)) return;

    try {
      const res = await window.electronAPI.doctors.setActiveStatus(doctor.id, !willDeactivate);
      if (res.success) {
        fetchDoctors();
      } else {
        alert(res.error || 'Failed to update doctor status.');
      }
    } catch {
      alert('An error occurred while updating status.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Referring Doctors Directory</h1>
          <p className="text-xs text-slate-500 mt-1">
            Maintain affiliated physicians, hospitals, and consultation specialists.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={fetchDoctors} isLoading={isLoading}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setDoctorToEdit(null);
              setIsFormOpen(true);
            }}
          >
            <UserPlus className="w-4 h-4 mr-1.5" />
            Add New Doctor
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-96">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by doctor name, clinic, or specialization..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs text-slate-600">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              <option value="active">Active Only</option>
              <option value="all">All Doctors</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Table Card */}
      <Card>
        {doctors.length === 0 ? (
          <div className="text-center py-16 px-4">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <Stethoscope className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 mb-1">
              {searchQuery ? 'No matching doctors found' : 'No doctors in directory'}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mb-5 leading-relaxed">
              {searchQuery
                ? 'Try a different search keyword or switch the status filter to All.'
                : 'Add referring physicians so they can be selected when booking patient visits.'}
            </p>
            {!searchQuery && (
              <Button
                size="sm"
                onClick={() => {
                  setDoctorToEdit(null);
                  setIsFormOpen(true);
                }}
              >
                <UserPlus className="w-4 h-4 mr-1.5" />
                Add First Doctor
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider bg-slate-50/50">
                  <th className="py-3 px-4">Doctor Name</th>
                  <th className="py-3 px-4">Specialization</th>
                  <th className="py-3 px-4">Phone Number</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {doctors.map((d) => (
                  <tr
                    key={d.id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      d.is_active === 0 ? 'opacity-60 bg-slate-50/40' : ''
                    }`}
                  >
                    <td className="py-3 px-4 font-semibold text-slate-900 whitespace-nowrap">
                      {d.full_name}
                    </td>
                    <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                      {d.specialization || 'General / Unspecified'}
                    </td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                      {d.phone_number || '—'}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {d.is_active === 1 ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <Badge variant="default" className="text-slate-400 bg-slate-100">
                          Inactive
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => {
                            setDoctorToEdit(d);
                            setIsFormOpen(true);
                          }}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                          title="Edit Details"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleToggleActive(d)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            d.is_active === 1
                              ? 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                              : 'text-emerald-600 hover:bg-emerald-50'
                          }`}
                          title={d.is_active === 1 ? 'Deactivate Doctor' : 'Reactivate Doctor'}
                        >
                          {d.is_active === 1 ? (
                            <PowerOff className="w-4 h-4" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <DoctorFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSuccess={() => fetchDoctors()}
        doctorToEdit={doctorToEdit}
      />
    </div>
  );
};

