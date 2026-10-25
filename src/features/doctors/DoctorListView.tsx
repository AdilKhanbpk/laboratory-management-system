import React, { useState, useEffect, useCallback } from 'react';
import { Doctor } from '../../types';
import { DoctorFormModal } from './DoctorFormModal';
import { Plus, Search, Pencil, PowerOff, RotateCcw, RefreshCw } from 'lucide-react';

/*
 * Same tokens as the rest of the app:
 *   primary #0F766E / hover #115E59, surface #FFFFFF, toolbar and table header #F8FAFC,
 *   text #1F2937, muted #64748B, border #E2E8F0 (inputs #CBD5E1), success #15803D.
 */

const inputClass =
  'block w-full h-9 px-3 rounded-md border border-[#CBD5E1] bg-white text-[13px] text-[#1F2937] ' +
  'placeholder:text-[#94A3B8] focus:outline-none focus:border-[#0F766E] focus:ring-1 focus:ring-[#0F766E]';

const primaryBtn =
  'inline-flex items-center justify-center gap-2 h-9 px-4 rounded-md bg-[#0F766E] text-[13px] font-medium text-white ' +
  'hover:bg-[#115E59] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] focus-visible:ring-offset-2';

const secondaryBtn =
  'inline-flex items-center justify-center gap-2 h-9 px-3 rounded-md border border-[#CBD5E1] bg-white text-[13px] font-medium text-[#1F2937] ' +
  'hover:bg-[#F8FAFC] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] disabled:opacity-50 disabled:cursor-not-allowed';

const iconBtn =
  'w-8 h-8 inline-flex items-center justify-center rounded-md text-[#64748B] hover:bg-[#F1F5F9] ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]';

const th = 'px-4 py-2.5 text-xs font-medium text-[#64748B] whitespace-nowrap';
const td = 'px-4 py-3 text-[13px] align-middle whitespace-nowrap';

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

  const handleOpenNew = () => {
    setDoctorToEdit(null);
    setIsFormOpen(true);
  };

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
    <div className="space-y-6 pb-12 text-[#1F2937]">
      {/* Page heading */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Referring doctors</h1>
          <p className="mt-1 text-[13px] text-[#64748B]">
            Physicians and clinics that refer patients to this laboratory.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={fetchDoctors} disabled={isLoading} className={secondaryBtn}>
            <RefreshCw className={`w-4 h-4 text-[#64748B] ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button type="button" onClick={handleOpenNew} className={primaryBtn}>
            <Plus className="w-4 h-4" />
            New doctor
          </button>
        </div>
      </div>

      {/* Filters and table share one panel */}
      <section className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 px-4 py-3 bg-[#F8FAFC] border-b border-[#E2E8F0]">
          <div className="relative md:col-span-8">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#94A3B8]" aria-hidden="true" />
            <input
              type="text"
              aria-label="Search doctors"
              placeholder="Search by name, clinic or specialization"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`${inputClass} pl-9`}
            />
          </div>

          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
            className={`${inputClass} md:col-span-4`}
          >
            <option value="active">Active doctors</option>
            <option value="all">All doctors</option>
            <option value="inactive">Inactive doctors</option>
          </select>
        </div>

        {doctors.length === 0 ? (
          <div className="px-4 py-14 text-center">
            <p className="text-[13px] font-medium">
              {searchQuery ? 'No doctors match this search' : 'No doctors added yet'}
            </p>
            <p className="mt-1 text-xs text-[#64748B]">
              {searchQuery
                ? 'Try a different keyword, or change the status filter to All doctors.'
                : 'Add referring doctors so they can be chosen when you create a visit.'}
            </p>
            {!searchQuery && (
              <button type="button" onClick={handleOpenNew} className={`${primaryBtn} mt-4`}>
                <Plus className="w-4 h-4" />
                New doctor
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                <tr>
                  <th scope="col" className={th}>Doctor</th>
                  <th scope="col" className={th}>Specialization</th>
                  <th scope="col" className={th}>Phone</th>
                  <th scope="col" className={th}>Status</th>
                  <th scope="col" className={`${th} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {doctors.map((d) => {
                  const isActive = d.is_active === 1;
                  return (
                    <tr key={d.id} className="border-b border-[#E2E8F0] last:border-b-0 hover:bg-[#F8FAFC]">
                      <td className={`${td} font-medium ${isActive ? '' : 'text-[#64748B]'}`}>{d.full_name}</td>
                      <td className={`${td} ${isActive ? '' : 'text-[#64748B]'}`}>
                        {d.specialization || <span className="text-[#64748B]">General</span>}
                      </td>
                      <td className={`${td} tabular-nums text-[#64748B]`}>{d.phone_number || '–'}</td>
                      <td className={td}>
                        <span className="inline-flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${isActive ? 'bg-[#15803D]' : 'bg-[#94A3B8]'}`}
                            aria-hidden="true"
                          />
                          {isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className={td}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setDoctorToEdit(d);
                              setIsFormOpen(true);
                            }}
                            title="Edit details"
                            aria-label={`Edit ${d.full_name}`}
                            className={`${iconBtn} hover:text-[#1F2937]`}
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleActive(d)}
                            title={isActive ? 'Deactivate doctor' : 'Reactivate doctor'}
                            aria-label={`${isActive ? 'Deactivate' : 'Reactivate'} ${d.full_name}`}
                            className={`${iconBtn} ${isActive ? 'hover:text-[#DC2626]' : 'hover:text-[#0F766E]'}`}
                          >
                            {isActive ? <PowerOff className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {doctors.length > 0 && (
          <div className="px-4 py-3 border-t border-[#E2E8F0] bg-[#F8FAFC] text-[13px] text-[#64748B] tabular-nums">
            {doctors.length} {doctors.length === 1 ? 'doctor' : 'doctors'}
          </div>
        )}
      </section>

      <DoctorFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSuccess={() => fetchDoctors()}
        doctorToEdit={doctorToEdit}
      />
    </div>
  );
};