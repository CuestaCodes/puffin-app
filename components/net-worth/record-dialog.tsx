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
import { Loader2, Plus, Minus } from 'lucide-react';
import { formatCurrencyAUD } from '@/lib/utils';
import {
  DEFAULT_ASSET_FIELDS,
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

export function RecordNetWorthDialog({
  open,
  onOpenChange,
  onSave,
  editEntry,
  latestEntry,
}: RecordNetWorthDialogProps) {
  const [recordedAt, setRecordedAt] = useState(new Date().toISOString().split('T')[0]);
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
        // Editing existing entry
        setRecordedAt(editEntry.recorded_at);
        setAssetFields(editEntry.assets.fields);
        setLiabilityFields(editEntry.liabilities.fields);
        setNotes(editEntry.notes || '');
      } else if (latestEntry) {
        // New entry - pre-populate with latest entry values (but new date)
        setRecordedAt(new Date().toISOString().split('T')[0]);
        setAssetFields(latestEntry.assets.fields.map(f => ({ ...f })));
        setLiabilityFields(latestEntry.liabilities.fields.map(f => ({ ...f })));
        setNotes('');
      } else {
        // First entry ever - use defaults with zero values
        setRecordedAt(new Date().toISOString().split('T')[0]);
        setAssetFields(
          DEFAULT_ASSET_FIELDS.map(f => ({ key: f.key, label: f.label, value: 0 }))
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
  const totalLiabilities = liabilityFields.reduce((sum, f) => sum + (f.value || 0), 0);
  const netWorth = totalAssets - totalLiabilities;

  const formatCurrency = (amount: number) => formatCurrencyAUD(amount);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const assets: AssetsData = { fields: assetFields };
      const liabilities: LiabilitiesData = { fields: liabilityFields };

      const url = editEntry ? `/api/net-worth/${editEntry.id}` : '/api/net-worth';

      const result = editEntry
        ? await api.put(url, {
            recorded_at: recordedAt,
            assets,
            liabilities,
            notes: notes || null,
          })
        : await api.post(url, {
            recorded_at: recordedAt,
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
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-700">
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
            <Input
              type="date"
              value={recordedAt}
              onChange={e => setRecordedAt(e.target.value)}
              className="bg-slate-800 border-slate-700 text-white max-w-[200px]"
            />
          </div>

          {/* Summary */}
          <div className="grid grid-cols-3 gap-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
            <div className="text-center">
              <p className="text-sm text-slate-400">Total Assets</p>
              <p className="text-xl font-bold text-emerald-400">{formatCurrency(totalAssets)}</p>
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

          {/* Assets */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-emerald-400" />
              <h3 className="text-lg font-semibold text-emerald-400">Assets</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {assetFields.map((field, index) => (
                <div key={field.key} className="flex gap-2">
                  <Input
                    value={field.label}
                    onChange={e => updateAssetField(index, { label: e.target.value })}
                    className="bg-slate-800 border-slate-700 text-white flex-1"
                    placeholder="Label"
                  />
                  <div className="relative">
                    <Input
                      type="number"
                      value={field.value || ''}
                      onChange={e => handleAssetValueChange(index, e.target.value)}
                      className={`bg-slate-800 text-white w-32 text-right ${
                        invalidAssetInputs.has(index)
                          ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                          : 'border-slate-700'
                      }`}
                      placeholder="0"
                    />
                    {invalidAssetInputs.has(index) && (
                      <span className="absolute -bottom-4 right-0 text-xs text-red-400">
                        Invalid number
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Liabilities */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Minus className="w-4 h-4 text-red-400" />
              <h3 className="text-lg font-semibold text-red-400">Liabilities</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
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

