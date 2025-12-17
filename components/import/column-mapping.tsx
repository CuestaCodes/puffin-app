'use client';

import React from 'react';
import { ArrowRight, Check, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ColumnMapping, DateFormat, CSVParseResult } from '@/types/import';

interface ColumnMappingProps {
  parseResult: CSVParseResult;
  mapping: ColumnMapping;
  dateFormat: DateFormat;
  onMappingChange: (mapping: ColumnMapping) => void;
  onDateFormatChange: (format: DateFormat) => void;
  onContinue: () => void;
  onBack: () => void;
}

const dateFormats: { value: DateFormat; label: string; example: string }[] = [
  { value: 'auto', label: 'Auto-detect', example: 'Let the system detect' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD', example: '2024-12-18' },
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY', example: '18/12/2024' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY', example: '12/18/2024' },
  { value: 'DD-MM-YYYY', label: 'DD-MM-YYYY', example: '18-12-2024' },
];

const requiredFields = [
  { key: 'date' as const, label: 'Date', description: 'Transaction date' },
  { key: 'description' as const, label: 'Description', description: 'Transaction description/memo' },
  { key: 'amount' as const, label: 'Amount', description: 'Transaction amount' },
];

export function ColumnMappingComponent({
  parseResult,
  mapping,
  dateFormat,
  onMappingChange,
  onDateFormatChange,
  onContinue,
  onBack,
}: ColumnMappingProps) {
  const { headers, rows } = parseResult;

  // Get sample values for a column (first 3 non-empty)
  const getSampleValues = (columnIndex: number): string[] => {
    const samples: string[] = [];
    for (const row of rows) {
      if (row[columnIndex] && row[columnIndex].trim() && samples.length < 3) {
        samples.push(row[columnIndex].trim());
      }
      if (samples.length >= 3) break;
    }
    return samples;
  };

  const handleColumnSelect = (field: keyof ColumnMapping, columnIndex: number) => {
    if (field === 'ignore') return;
    
    // Remove the column from ignore if it was there
    const newIgnore = mapping.ignore.filter(i => i !== columnIndex);
    
    // If this column was already assigned to another field, swap
    const newMapping = { ...mapping, ignore: newIgnore };
    
    if (mapping.date === columnIndex && field !== 'date') {
      newMapping.date = -1;
    }
    if (mapping.description === columnIndex && field !== 'description') {
      newMapping.description = -1;
    }
    if (mapping.amount === columnIndex && field !== 'amount') {
      newMapping.amount = -1;
    }
    
    newMapping[field] = columnIndex;
    onMappingChange(newMapping);
  };

  const getAssignedField = (columnIndex: number): string | null => {
    if (mapping.date === columnIndex) return 'Date';
    if (mapping.description === columnIndex) return 'Description';
    if (mapping.amount === columnIndex) return 'Amount';
    return null;
  };

  const isValid = mapping.date >= 0 && mapping.description >= 0 && mapping.amount >= 0;

  return (
    <div className="space-y-6">
      {/* Instructions */}
      <div className="text-sm text-slate-400">
        Map your CSV columns to the required fields. Click on a column to assign it.
      </div>

      {/* Date Format Selection */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-300">Date Format</label>
        <div className="flex flex-wrap gap-2">
          {dateFormats.map((format) => (
            <button
              key={format.value}
              onClick={() => onDateFormatChange(format.value)}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm transition-colors',
                dateFormat === format.value
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              )}
            >
              {format.label}
            </button>
          ))}
        </div>
      </div>

      {/* Required Fields */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-slate-300">Required Fields</h3>
        <div className="grid gap-2">
          {requiredFields.map((field) => {
            const currentValue = mapping[field.key as keyof Omit<ColumnMapping, 'ignore'>];
            const isAssigned = typeof currentValue === 'number' && currentValue >= 0;
            
            return (
              <div
                key={field.key}
                className={cn(
                  'flex items-center justify-between p-3 rounded-lg border',
                  isAssigned
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : 'bg-slate-800/50 border-slate-700'
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center',
                    isAssigned ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-400'
                  )}>
                    {isAssigned ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <span className="text-xs">?</span>
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-slate-200">{field.label}</p>
                    <p className="text-xs text-slate-500">{field.description}</p>
                  </div>
                </div>
                
                {isAssigned && typeof currentValue === 'number' ? (
                  <div className="flex items-center gap-2">
                    <ArrowRight className="w-4 h-4 text-slate-500" />
                    <span className="text-sm font-medium text-emerald-400">
                      {headers[currentValue]}
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Not mapped
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Column Selection Grid */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-slate-300">CSV Columns</h3>
        <p className="text-xs text-slate-500">Click a column, then select which field to map it to</p>
        
        <div className="grid gap-3">
          {headers.map((header, index) => {
            const samples = getSampleValues(index);
            const assignedField = getAssignedField(index);
            
            return (
              <div
                key={index}
                className={cn(
                  'p-4 rounded-lg border transition-colors',
                  assignedField
                    ? 'bg-emerald-500/5 border-emerald-500/30'
                    : 'bg-slate-800/50 border-slate-700'
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs px-1.5 py-0.5 bg-slate-700 rounded text-slate-400">
                        Col {index + 1}
                      </span>
                      <h4 className="font-medium text-slate-200 truncate">{header || `Column ${index + 1}`}</h4>
                      {assignedField && (
                        <span className="text-xs px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded">
                          {assignedField}
                        </span>
                      )}
                    </div>
                    {samples.length > 0 && (
                      <div className="text-xs text-slate-500 space-y-0.5">
                        {samples.map((sample, i) => (
                          <p key={i} className="truncate">• {sample}</p>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex gap-1.5 flex-shrink-0">
                    {requiredFields.map((field) => (
                      <button
                        key={field.key}
                        onClick={() => handleColumnSelect(field.key, index)}
                        className={cn(
                          'px-2 py-1 text-xs rounded transition-colors',
                          mapping[field.key as keyof Omit<ColumnMapping, 'ignore'>] === index
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-slate-200'
                        )}
                      >
                        {field.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-between pt-4 border-t border-slate-700">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button
          onClick={onContinue}
          disabled={!isValid}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          Continue to Preview
        </Button>
      </div>
    </div>
  );
}

