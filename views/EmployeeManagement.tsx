import React, { useState, useEffect } from 'react';
import { 
  Users, 
  UserPlus, 
  Trash2, 
  Edit3, 
  Briefcase, 
  Mail, 
  Phone, 
  DollarSign, 
  CreditCard, 
  Building2, 
  Check, 
  AlertCircle, 
  Loader2, 
  X, 
  Search,
  Plus,
  Percent
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Employee, CostCenter } from '../types';
import { useAccessControl } from '../lib/AccessControlContext';

const EmployeeManagement: React.FC = () => {
  const { hasFeature } = useAccessControl();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [editingEmployee, setEditingEmployee] = useState<Partial<Employee> | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Allowances Form Helper
  const [allowanceKey, setAllowanceKey] = useState('');
  const [allowanceVal, setAllowanceVal] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: empData, error: empErr } = await supabase
        .from('employees')
        .select('*')
        .order('created_at', { ascending: false });

      if (empErr) throw empErr;
      setEmployees(empData || []);

      const { data: ccData, error: ccErr } = await supabase
        .from('cost_centers')
        .select('*')
        .order('code', { ascending: true });

      if (ccErr) throw ccErr;
      setCostCenters(ccData || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch HR data');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingEmployee({
      full_name: '',
      email: '',
      phone: '',
      role: 'staff',
      status: 'active',
      base_salary: 0,
      allowances: {},
      bank_name: '',
      bank_account_number: '',
      iban: '',
      cost_center_id: costCenters[0]?.id || '',
      sales_percentage: 0
    });
    setAllowanceKey('');
    setAllowanceVal('');
    setShowModal(true);
  };

  const handleOpenEdit = (emp: Employee) => {
    setEditingEmployee({ ...emp });
    setAllowanceKey('');
    setAllowanceVal('');
    setShowModal(true);
  };

  const handleAddAllowance = () => {
    if (!allowanceKey.trim() || !allowanceVal) return;
    const value = parseFloat(allowanceVal);
    if (isNaN(value)) return;

    if (editingEmployee) {
      const allowances = { ...(editingEmployee.allowances || {}) };
      allowances[allowanceKey.trim()] = value;
      setEditingEmployee({ ...editingEmployee, allowances });
      setAllowanceKey('');
      setAllowanceVal('');
    }
  };

  const handleRemoveAllowance = (key: string) => {
    if (editingEmployee) {
      const allowances = { ...(editingEmployee.allowances || {}) };
      delete allowances[key];
      setEditingEmployee({ ...editingEmployee, allowances });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee || isSubmitting) return;

    // Check permissions
    if (!hasFeature('identity.user.create')) {
      setError('Access denied: You do not have permissions to manage employees.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = {
        full_name: editingEmployee.full_name,
        email: editingEmployee.email,
        phone: editingEmployee.phone || null,
        role: editingEmployee.role,
        status: editingEmployee.status,
        base_salary: Number(editingEmployee.base_salary) || 0,
        allowances: editingEmployee.allowances || {},
        bank_name: editingEmployee.bank_name,
        bank_account_number: editingEmployee.bank_account_number,
        iban: editingEmployee.iban,
        cost_center_id: editingEmployee.cost_center_id || null,
        sales_percentage: Number(editingEmployee.sales_percentage) || 0
      };

      if (editingEmployee.id) {
        // Edit Mode
        const { error: saveErr } = await supabase
          .from('employees')
          .update(payload)
          .eq('id', editingEmployee.id);

        if (saveErr) throw saveErr;
        setSuccess('Employee updated successfully');
      } else {
        // Create Mode
        const { error: saveErr } = await supabase
          .from('employees')
          .insert(payload);

        if (saveErr) throw saveErr;
        setSuccess('Employee created successfully');
      }

      setShowModal(false);
      setEditingEmployee(null);
      await fetchData();
    } catch (err: any) {
      setError(err.message || 'Error saving employee details');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this employee record?')) return;
    setError(null);
    setSuccess(null);
    try {
      const { error: delErr } = await supabase
        .from('employees')
        .delete()
        .eq('id', id);

      if (delErr) throw delErr;
      setSuccess('Employee deleted successfully');
      await fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to delete employee');
    }
  };

  const filteredEmployees = employees.filter(emp => 
    emp.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">HR & Employees</h1>
          <p className="text-gray-500 text-sm font-semibold">Manage PowerPod payroll structure and personnel master files</p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-xl shadow-lg shadow-blue-500/20 transition duration-150 text-sm"
        >
          <UserPlus size={16} />
          <span>Add Employee</span>
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center space-x-2 text-sm">
          <AlertCircle size={16} />
          <span className="font-bold">{error}</span>
        </div>
      )}
      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 flex items-center space-x-2 text-sm">
          <Check size={16} />
          <span className="font-bold">{success}</span>
        </div>
      )}

      {/* Filter and Search */}
      <div className="flex items-center space-x-3 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-3 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, email, or role..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
          />
        </div>
      </div>

      {/* Main Table */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-gray-200 shadow-sm">
          <Loader2 size={32} className="text-blue-500 animate-spin mb-2" />
          <p className="text-gray-500 text-sm font-bold">Loading Employee Master Records...</p>
        </div>
      ) : filteredEmployees.length === 0 ? (
        <div className="text-center p-12 bg-white rounded-xl border border-gray-200 shadow-sm">
          <Users size={48} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-bold text-lg mb-1">No Employees Found</p>
          <p className="text-gray-400 text-sm mb-4">Start by adding your first employee to set up the general ledger payroll structure.</p>
          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-xl transition text-sm shadow-md"
          >
            <Plus size={16} />
            <span>Create Profile</span>
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Employee</th>
                  <th scope="col" className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Role & CC</th>
                  <th scope="col" className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Base Salary</th>
                  <th scope="col" className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Allowances</th>
                  <th scope="col" className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Bank Details</th>
                  <th scope="col" className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                  <th scope="col" className="px-6 py-4 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {filteredEmployees.map((emp) => {
                  const cc = costCenters.find(c => c.id === emp.cost_center_id);
                  const totalAllowances = Object.values(emp.allowances || {}).reduce((a, b) => a + b, 0);
                  
                  return (
                    <tr key={emp.id} className="hover:bg-gray-50 transition duration-150">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-3">
                          <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold shrink-0">
                            {emp.full_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-900">{emp.full_name}</p>
                            <div className="flex items-center text-xs text-gray-500 font-semibold space-x-1.5 mt-0.5">
                              <Mail size={12} />
                              <span className="truncate">{emp.email}</span>
                            </div>
                            {emp.phone && (
                              <div className="flex items-center text-[10px] text-gray-400 font-bold space-x-1 mt-0.5">
                                <Phone size={10} />
                                <span>{emp.phone}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-1 text-sm font-bold text-gray-700 capitalize">
                          <Briefcase size={14} className="text-gray-400" />
                          <span>{emp.role}</span>
                        </div>
                        {cc && (
                          <span className="inline-flex mt-1 items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-100 uppercase tracking-wider">
                            CC: {cc.code} ({cc.name})
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-black text-gray-900">
                          {emp.base_salary.toLocaleString('en-US', { minimumFractionDigits: 2 })} AED
                        </div>
                        {emp.sales_percentage !== undefined && emp.sales_percentage > 0 && (
                          <div className="text-[10px] text-purple-600 font-bold mt-0.5">
                            Sales Comm: {emp.sales_percentage}%
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <p className="text-sm font-bold text-gray-900">{totalAllowances.toLocaleString('en-US', { minimumFractionDigits: 2 })} AED</p>
                        {Object.keys(emp.allowances || {}).length > 0 && (
                          <p className="text-[10px] text-gray-400 font-semibold truncate max-w-[150px]">
                            {Object.keys(emp.allowances).join(', ')}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-xs font-semibold text-gray-800 flex items-center space-x-1">
                          <Building2 size={12} className="text-gray-400 shrink-0" />
                          <span className="truncate max-w-[120px]">{emp.bank_name}</span>
                        </div>
                        <p className="text-[10px] text-gray-500 font-mono tracking-tight mt-0.5">{emp.iban}</p>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ${
                          emp.status === 'active' 
                            ? 'bg-emerald-100 text-emerald-800' 
                            : emp.status === 'inactive' 
                            ? 'bg-amber-100 text-amber-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {emp.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => handleOpenEdit(emp)}
                            className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition duration-150"
                            title="Edit employee details"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(emp.id)}
                            className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition duration-150"
                            title="Delete employee profile"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal - Create/Edit Form */}
      {showModal && editingEmployee && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-gray-200 flex justify-between items-center shrink-0">
              <h3 className="text-lg font-black text-gray-900 tracking-tight">
                {editingEmployee.id ? 'Edit Employee Record' : 'Add New Employee Record'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            {/* Content Form */}
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Personnel Block */}
              <div className="space-y-4">
                <h4 className="text-xs font-black uppercase text-gray-400 tracking-wider">Personnel Details</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Full Name</label>
                    <input
                      required
                      type="text"
                      value={editingEmployee.full_name || ''}
                      onChange={(e) => setEditingEmployee({ ...editingEmployee, full_name: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Email Address</label>
                    <input
                      required
                      type="email"
                      value={editingEmployee.email || ''}
                      onChange={(e) => setEditingEmployee({ ...editingEmployee, email: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Phone Number</label>
                    <input
                      type="text"
                      placeholder="+971..."
                      value={editingEmployee.phone || ''}
                      onChange={(e) => setEditingEmployee({ ...editingEmployee, phone: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Role Designation</label>
                    <input
                      required
                      type="text"
                      placeholder="e.g. Technician, Marketing Lead"
                      value={editingEmployee.role || ''}
                      onChange={(e) => setEditingEmployee({ ...editingEmployee, role: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Status</label>
                    <select
                      value={editingEmployee.status || 'active'}
                      onChange={(e) => setEditingEmployee({ ...editingEmployee, status: e.target.value as any })}
                      className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="terminated">Terminated</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Cost Center Allocation</label>
                    <select
                      value={editingEmployee.cost_center_id || ''}
                      onChange={(e) => setEditingEmployee({ ...editingEmployee, cost_center_id: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                    >
                      <option value="">No Allocation</option>
                      {costCenters.map(cc => (
                        <option key={cc.id} value={cc.id}>{cc.code} - {cc.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Financial Compensation Block */}
              <div className="space-y-4 pt-4 border-t border-gray-100">
                <h4 className="text-xs font-black uppercase text-gray-400 tracking-wider">Salary & Allowances</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Base Monthly Salary (AED)</label>
                    <div className="relative">
                      <DollarSign size={16} className="absolute left-3 top-3.5 text-gray-400" />
                      <input
                        required
                        type="number"
                        min="0"
                        step="0.01"
                        value={editingEmployee.base_salary || 0}
                        onChange={(e) => setEditingEmployee({ ...editingEmployee, base_salary: parseFloat(e.target.value) || 0 })}
                        className="w-full border border-gray-200 rounded-lg pl-8 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-black"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Sales Commission Percentage (%)</label>
                    <div className="relative">
                      <Percent className="absolute left-3 top-3.5 text-gray-400" size={16} />
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        placeholder="e.g. 10"
                        value={editingEmployee.sales_percentage || 0}
                        onChange={(e) => setEditingEmployee({ ...editingEmployee, sales_percentage: parseFloat(e.target.value) || 0 })}
                        className="w-full border border-gray-200 rounded-lg pl-8 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-black"
                      />
                    </div>
                  </div>
                  
                  {/* Allowances Section */}
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Add Custom Allowance</label>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        placeholder="Key (e.g. Housing)"
                        value={allowanceKey}
                        onChange={(e) => setAllowanceKey(e.target.value)}
                        className="w-1/2 border border-gray-200 rounded-lg p-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold"
                      />
                      <input
                        type="number"
                        placeholder="AED Amount"
                        value={allowanceVal}
                        onChange={(e) => setAllowanceVal(e.target.value)}
                        className="w-1/2 border border-gray-200 rounded-lg p-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold"
                      />
                      <button
                        type="button"
                        onClick={handleAddAllowance}
                        className="bg-gray-900 text-white rounded-lg px-3 hover:bg-gray-800 text-xs font-bold"
                      >
                        Add
                      </button>
                    </div>

                    {/* Allowances list */}
                    {editingEmployee.allowances && Object.keys(editingEmployee.allowances).length > 0 && (
                      <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-1.5">
                        {Object.entries(editingEmployee.allowances).map(([k, v]) => (
                          <div key={k} className="flex justify-between items-center text-xs">
                            <span className="text-gray-500 font-bold capitalize">{k}:</span>
                            <div className="flex items-center space-x-1.5">
                              <span className="font-black text-gray-900">{v.toLocaleString()} AED</span>
                              <button 
                                type="button" 
                                onClick={() => handleRemoveAllowance(k)}
                                className="text-red-500 hover:text-red-700 font-bold"
                              >
                                &times;
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Bank Details Block */}
              <div className="space-y-4 pt-4 border-t border-gray-100">
                <h4 className="text-xs font-black uppercase text-gray-400 tracking-wider">Bank Disbursement Information</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Bank Name</label>
                    <input
                      required
                      type="text"
                      placeholder="e.g. Emirates NBD"
                      value={editingEmployee.bank_name || ''}
                      onChange={(e) => setEditingEmployee({ ...editingEmployee, bank_name: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Account Number</label>
                    <input
                      required
                      type="text"
                      value={editingEmployee.bank_account_number || ''}
                      onChange={(e) => setEditingEmployee({ ...editingEmployee, bank_account_number: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">IBAN</label>
                    <div className="relative">
                      <CreditCard size={16} className="absolute left-3 top-3.5 text-gray-400" />
                      <input
                        required
                        type="text"
                        placeholder="AE..."
                        value={editingEmployee.iban || ''}
                        onChange={(e) => setEditingEmployee({ ...editingEmployee, iban: e.target.value.toUpperCase() })}
                        className="w-full border border-gray-200 rounded-lg pl-8 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono font-bold"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Form Actions Footer */}
              <div className="pt-6 border-t border-gray-200 flex justify-end space-x-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-500/20 flex items-center space-x-2"
                >
                  {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  <span>Save Record</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeManagement;
