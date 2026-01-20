'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/services';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, Minus, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn, formatCurrencyAUD } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  DEFAULT_LIQUID_ASSET_FIELDS,
  ALL_ASSET_FIELDS,
  DEFAULT_LIABILITY_FIELDS,
  type NetWorthField,
  type NetWorthEntryParsed,
  type AssetsData,
  type LiabilitiesData,
} from '@/types/net-worth';

interface RecordNetWorthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
  editEntry?: NetWorthEntryParsed | null;
  latestEntry?: NetWorthEntryParsed | null;
}

// Map of liquid asset keys for migrating old entries
const LIQUID_ASSET_KEYS = new Set<string>(DEFAULT_LIQUID_ASSET_FIELDS.map(f => f.key));

/**
 * Ensure asset fields have the isLiquid flag based on their key.
 * This handles migration of existing entries that don't have the flag.
 */
function ensureIsLiquidFlag(fields: NetWorthField[]): NetWorthField[] {
  return fields.map(f => ({
    ...f,
    isLiquid: f.isLiquid !== undefined ? f.isLiquid : LIQUID_ASSET_KEYS.has(f.key),
  }));
}

export function RecordNetWorthDialog({
  open,
  onOpenChange,
  onSave,
  editEntry,
  latestEntry,
}: RecordNetWorthDialogProps) {
  const [recordedAt, setRecordedAt] = useState<Date>(new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [assetFields, setAssetFields] = useState<NetWorthField[]>([]);
  const [liabilityFields, setLiabilityFields] = useState<NetWorthField[]>([]);
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Track invalid number inputs for visual feedback
  const [invalidAssetInputs, setInvalidAssetInputs] = useState<Set<number>>(new Set());
  const [invalidLiabilityInputs, setInvalidLiabilityInputs] = useState<Set<number>>(new Set());

  // Initialize fields when dialog opens
  useEffect(() => {
    if (open) {
      if (editEntry) {
        // Editing existing entry - ensure isLiquid flag is set for migration
        setRecordedAt(new Date(editEntry.recorded_at + 'T00:00:00'));
        setAssetFields(ensureIsLiquidFlag(editEntry.assets.fields));
        setLiabilityFields(editEntry.liabilities.fields);
        setNotes(editEntry.notes || '');
      } else if (latestEntry) {
        // New entry - pre-populate with latest entry values (but new date)
        setRecordedAt(new Date());
        setAssetFields(ensureIsLiquidFlag(latestEntry.assets.fields.map(f => ({ ...f }))));
        setLiabilityFields(latestEntry.liabilities.fields.map(f => ({ ...f })));
        setNotes('');
      } else {
        // First entry ever - use defaults with zero values (includes isLiquid flag)
        setRecordedAt(new Date());
        setAssetFields(
          ALL_ASSET_FIELDS.map(f => ({ key: f.key, label: f.label, value: 0, isLiquid: f.isLiquid }))
        );
        setLiabilityFields(
          DEFAULT_LIABILITY_FIELDS.map(f => ({ key: f.key, label: f.label, value: 0 }))
        );
        setNotes('');
      }
      setError(null);
      setInvalidAssetInputs(new Set());
      setInvalidLiabilityInputs(new Set());
    }
  }, [open, editEntry, latestEntry]);

  const updateAssetField = (index: number, field: Partial<NetWorthField>) => {
    setAssetFields(prev =>
      prev.map((f, i) => (i === index ? { ...f, ...field } : f))
    );
  };

  const updateLiabilityField = (index: number, field: Partial<NetWorthField>) => {
    setLiabilityFields(prev =>
      prev.map((f, i) => (i === index ? { ...f, ...field } : f))
    );
  };

  // Parse number with validation - returns value and whether it's valid
  const parseNumberValue = (value: string): { parsed: number; isValid: boolean } => {
    if (value === '' || value === '-') {
      return { parsed: 0, isValid: true };
    }
    const parsed = parseFloat(value);
    return { parsed: isNaN(parsed) ? 0 : parsed, isValid: !isNaN(parsed) };
  };

  const handleAssetValueChange = (index: number, value: string) => {
    const { parsed, isValid } = parseNumberValue(value);
    updateAssetField(index, { value: parsed });
    
    setInvalidAssetInputs(prev => {
      const next = new Set(prev);
      if (isValid) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleLiabilityValueChange = (index: number, value: string) => {
    const { parsed, isValid } = parseNumberValue(value);
    updateLiabilityField(index, { value: parsed });
    
    setInvalidLiabilityInputs(prev => {
      const next = new Set(prev);
      if (isValid) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const totalAssets = assetFields.reduce((sum, f) => sum + (f.value || 0), 0);
  const totalLiquidAssets = assetFields.filter(f => f.isLiquid === true).reduce((sum, f) => sum + (f.value || 0), 0);
  const totalLiabilities = liabilityFields.reduce((sum, f) => sum + (f.value || 0), 0);
  const netWorth = totalAssets - totalLiabilities;

  // Split asset fields into non-liquid and liquid
  const nonLiquidAssetFields = assetFields.filter(f => f.isLiquid !== true);
  const liquidAssetFields = assetFields.filter(f => f.isLiquid === true);

  const formatCurrency = (amount: number) => formatCurrencyAUD(amount);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const assets: AssetsData = { fields: assetFields };
      const liabilities: LiabilitiesData = { fields: liabilityFields };
      // Format date as YYYY-MM-DD
      const recordedAtStr = format(recordedAt, 'yyyy-MM-dd');

      const url = editEntry ? `/api/net-worth/${editEntry.id}` : '/api/net-worth';

      const result = editEntry
        ? await api.put(url, {
            recorded_at: recordedAtStr,
            assets,
            liabilities,
            notes: notes || null,
          })
        : await api.post(url, {
            recorded_at: recordedAtStr,
            assets,
            liabilities,
            notes: notes || null,
          });

      if (result.data) {
        onSave();
        onOpenChange(false);
      } else {
        setError(result.error || 'Failed to save entry');
      }
    } catch (err) {
      console.error('Failed to save net worth entry:', err);
      setError('Failed to save entry');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[98vw] max-w-[1400px] sm:max-w-[1400px] max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-xl text-white">
            {editEntry ? 'Edit Net Worth Entry' : 'Record Net Worth'}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Enter your current assets and liabilities to calculate your net worth.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Date */}
          <div className="space-y-2">
            <Label className="text-slate-200">Date</Label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-[200px] justify-start text-left font-normal bg-slate-800 border-slate-700 text-white hover:bg-slate-700 hover:text-white'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(recordedAt, 'PPP')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-slate-900 border-slate-700" align="start">
                <Calendar
                  mode="single"
                  selected={recordedAt}
                  onSelect={(d) => {
                    if (d) setRecordedAt(d);
                    setCalendarOpen(false);
                  }}
                  initialFocus
                  className="bg-slate-900"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
            <div className="text-center">
              <p className="text-sm text-slate-400">Total Assets</p>
              <p className="text-xl font-bold text-emerald-400">{formatCurrency(totalAssets)}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-slate-400">Liquid Assets</p>
              <p className="text-xl font-bold text-blue-400">{formatCurrency(totalLiquidAssets)}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-slate-400">Total Liabilities</p>
              <p className="text-xl font-bold text-red-400">{formatCurrency(totalLiabilities)}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-slate-400">Net Worth</p>
              <p className={`text-xl font-bold ${netWorth >= 0 ? 'text-cyan-400' : 'text-red-400'}`}>
                {formatCurrency(netWorth)}
              </p>
            </div>
          </div>

          {/* Non-Liquid Assets */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-emerald-400" />
              <h3 className="text-lg font-semibold text-emerald-400">Assets (Non-Liquid)</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {nonLiquidAssetFields.map((field) => {
                const originalIndex = assetFields.findIndex(f => f.key === field.key);
                return (
                  <div key={field.key} className="flex gap-2">
                    <Input
                      value={field.label}
                      onChange={e => updateAssetField(originalIndex, { label: e.target.value })}
                      className="bg-slate-800 border-slate-700 text-white flex-1"
                      placeholder="Label"
                    />
                    <div className="relative">
                      <Input
                        type="number"
                        value={field.value || ''}
                        onChange={e => handleAssetValueChange(originalIndex, e.target.value)}
                        className={`bg-slate-800 text-white w-32 text-right ${
                          invalidAssetInputs.has(originalIndex)
                            ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                            : 'border-slate-700'
                        }`}
                        placeholder="0"
                      />
                      {invalidAssetInputs.has(originalIndex) && (
                        <span className="absolute -bottom-4 right-0 text-xs text-red-400">
                          Invalid number
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Liquid Assets */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-blue-400" />
              <h3 className="text-lg font-semibold text-blue-400">Assets (Liquid)</h3>
              <span className="text-xs text-slate-500">Used for growth projections</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {liquidAssetFields.map((field) => {
                const originalIndex = assetFields.findIndex(f => f.key === field.key);
                return (
                  <div key={field.key} className="flex gap-2">
                    <Input
                      value={field.label}
                      onChange={e => updateAssetField(originalIndex, { label: e.target.value })}
                      className="bg-slate-800 border-slate-700 text-white flex-1"
                      placeholder="Label"
                    />
                    <div className="relative">
                      <Input
                        type="number"
                        value={field.value || ''}
                        onChange={e => handleAssetValueChange(originalIndex, e.target.value)}
                        className={`bg-slate-800 text-white w-32 text-right ${
                          invalidAssetInputs.has(originalIndex)
                            ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                            : 'border-slate-700'
                        }`}
                        placeholder="0"
                      />
                      {invalidAssetInputs.has(originalIndex) && (
                        <span className="absolute -bottom-4 right-0 text-xs text-red-400">
                          Invalid number
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Liabilities */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Minus className="w-4 h-4 text-red-400" />
              <h3 className="text-lg font-semibold text-red-400">Liabilities</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {liabilityFields.map((field, index) => (
                <div key={field.key} className="flex gap-2">
                  <Input
                    value={field.label}
                    onChange={e => updateLiabilityField(index, { label: e.target.value })}
                    className="bg-slate-800 border-slate-700 text-white flex-1"
                    placeholder="Label"
                  />
                  <div className="relative">
                    <Input
                      type="number"
                      value={field.value || ''}
                      onChange={e => handleLiabilityValueChange(index, e.target.value)}
                      className={`bg-slate-800 text-white w-32 text-right ${
                        invalidLiabilityInputs.has(index)
                          ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                          : 'border-slate-700'
                      }`}
                      placeholder="0"
                    />
                    {invalidLiabilityInputs.has(index) && (
                      <span className="absolute -bottom-4 right-0 text-xs text-red-400">
                        Invalid number
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label className="text-slate-200">Notes (optional)</Label>
            <Input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="bg-slate-800 border-slate-700 text-white"
              placeholder="Any notes about this snapshot..."
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-slate-700 text-slate-300"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-cyan-600 hover:bg-cyan-700 text-white"
          >
            {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {editEntry ? 'Update' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

