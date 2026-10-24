import React, { useState, useEffect, useCallback } from 'react';
import { Patient, PatientSearchResult } from '../../types';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { formatDateTime, calculateAge } from '../../lib/utils';
import { PatientFormModal } from './PatientFormModal';
import { PatientDetailModal } from './PatientDetailModal';
import {
  Users,
  UserPlus,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Eye,
  Edit2,
  RefreshCw,
} from 'lucide-react';

export const PatientListView: React.FC = () => {
  const [data, setData] = useState<PatientSearchResult>({
    patients: [],
    total: 0,
    page: 1,
    totalPages: 1,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [genderFilter, setGenderFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'created_at' | 'patient_mrn' | 'full_name'>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [patientToEdit, setPatientToEdit] = useState<Patient | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const fetchPatients = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await window.electronAPI.patients.search({
        query: searchQuery,
        gender: genderFilter,
        page: currentPage,
        limit: 15,
        sortBy,
        sortOrder,
      });

      if (res.success && res.data) {
        setData(res.data);
      }
    } catch (err) {
      console.error('Failed to load patient records:', err);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, genderFilter, currentPage, sortBy, sortOrder]);

  useEffect(() => {
    fetchPatients();
  }, [fetchPatients]);

  const handleOpenCreate = () => {
    setPatientToEdit(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (p: Patient) => {
    setPatientToEdit(p);
    setIsFormOpen(true);
  };

  const handleOpenDetail = (p: Patient) => {
    setSelectedPatient(p);
    setIsDetailOpen(true);
  };

  const handleSuccess = (p: Patient) => {
    fetchPatients();
    if (selectedPatient && selectedPatient.id === p.id) {
      setSelectedPatient(p);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Patient Directory</h1>
          <p className="text-xs text-slate-500 mt-1">
            Register and manage permanent medical record profiles and demographics.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={fetchPatients} isLoading={isLoading}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>
          <Button size="sm" onClick={handleOpenCreate}>
            <UserPlus className="w-4 h-4 mr-1.5" />
            Register New Patient
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-96">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by MRN, patient name, or phone..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-500"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span>Sex:</span>
              <select
                value={genderFilter}
                onChange={(e) => {
                  setGenderFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                <option value="all">All</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-slate-600 pl-2 border-l border-slate-200">
              <span>Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                <option value="created_at">Date Registered</option>
                <option value="patient_mrn">MRN</option>
                <option value="full_name">Patient Name</option>
              </select>
              <button
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="p-1 rounded border border-slate-300 hover:bg-slate-100 text-xs font-mono"
                title="Toggle sort direction"
              >
                {sortOrder === 'asc' ? '▲' : '▼'}
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Patients Table Card */}
      <Card>
        {data.patients.length === 0 ? (
          <div className="text-center py-16 px-4">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <Users className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 mb-1">
              {searchQuery ? 'No matching patient records found' : 'No patients registered yet'}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mb-5 leading-relaxed">
              {searchQuery
                ? 'Try searching with different terms, or check for typos in the name or MRN.'
                : 'Click below to register the first patient and generate an automated unique MRN.'}
            </p>
            {!searchQuery && (
              <Button size="sm" onClick={handleOpenCreate}>
                <UserPlus className="w-4 h-4 mr-1.5" />
                Register First Patient
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider bg-slate-50/50">
                  <th className="py-3 px-4">MRN</th>
                  <th className="py-3 px-4">Patient Name</th>
                  <th className="py-3 px-4">Sex / Age</th>
                  <th className="py-3 px-4">Phone Number</th>
                  <th className="py-3 px-4">Address</th>
                  <th className="py-3 px-4">Registered Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.patients.map((p) => {
                  const age = calculateAge(p.date_of_birth);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-brand-600 whitespace-nowrap">
                        {p.patient_mrn}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900 whitespace-nowrap">
                        {p.full_name}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap capitalize text-slate-700">
                        {p.gender} {age ? `• ${age.formatted}` : ''}
                      </td>
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                        {p.phone_number || '—'}
                      </td>
                      <td className="py-3 px-4 text-slate-500 max-w-xs truncate" title={p.address || ''}>
                        {p.address || '—'}
                      </td>
                      <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                        {formatDateTime(p.created_at)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenDetail(p)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                            title="View Full Profile"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenEdit(p)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                            title="Edit Details"
                          >
                            <Edit2 className="w-4 h-4" />
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

        {/* Pagination Bar */}
        {data.total > 0 && (
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>
              Showing {(data.page - 1) * 15 + 1} to {Math.min(data.page * 15, data.total)} of {data.total} patients
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={data.page <= 1}
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              >
                <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                Previous
              </Button>
              <span className="font-semibold text-slate-700">
                Page {data.page} of {data.totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={data.page >= data.totalPages}
                onClick={() => setCurrentPage((prev) => Math.min(data.totalPages, prev + 1))}
              >
                Next
                <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Modals */}
      <PatientFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSuccess={handleSuccess}
        patientToEdit={patientToEdit}
      />

      <PatientDetailModal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        patient={selectedPatient}
        onEdit={(p) => {
          setIsDetailOpen(false);
          handleOpenEdit(p);
        }}
      />
    </div>
  );
};

