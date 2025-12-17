'use client';

import React, { useState, useCallback } from 'react';
import { FileSpreadsheet, ArrowLeft, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileUpload } from './file-upload';
import { ColumnMappingComponent } from './column-mapping';
import { PreviewTable } from './preview-table';
import { parseCSV, detectColumnMapping } from '@/lib/csv/parser';
import { parseDate, detectDateFormat } from '@/lib/csv/date-parser';
import { cn } from '@/lib/utils';
import type { 
  CSVParseResult, 
  ColumnMapping, 
  DateFormat, 
  ImportPreview, 
  ParsedRow,
  ImportResult 
} from '@/types/import';

type ImportStep = 'upload' | 'mapping' | 'preview' | 'complete';

interface ImportWizardProps {
  onComplete?: (result: ImportResult) => void;
  onCancel?: () => void;
}

const steps: { id: ImportStep; label: string }[] = [
  { id: 'upload', label: 'Upload' },
  { id: 'mapping', label: 'Map Columns' },
  { id: 'preview', label: 'Preview' },
  { id: 'complete', label: 'Complete' },
];

export function ImportWizard({ onComplete, onCancel }: ImportWizardProps) {
  const [currentStep, setCurrentStep] = useState<ImportStep>('upload');
  const [parseResult, setParseResult] = useState<CSVParseResult | null>(null);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({
    date: -1,
    description: -1,
    amount: -1,
    ignore: [],
  });
  const [dateFormat, setDateFormat] = useState<DateFormat>('auto');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // Step 1: Handle file upload
  const handleFileSelect = useCallback(async (file: File) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await parseCSV(file);
      setParseResult(result);
      
      // Auto-detect column mapping
      const detectedMapping = detectColumnMapping(result.headers);
      if (detectedMapping) {
        setColumnMapping(detectedMapping);
      }
      
      // Auto-detect date format from samples
      if (detectedMapping && detectedMapping.date >= 0) {
        const dateSamples = result.rows
          .slice(0, 10)
          .map(row => row[detectedMapping.date])
          .filter(Boolean);
        const detectedFormat = detectDateFormat(dateSamples);
        setDateFormat(detectedFormat);
      }
      
      setCurrentStep('mapping');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse CSV file');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Step 2: Continue from mapping to preview
  const handleMappingContinue = useCallback(async () => {
    if (!parseResult) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Generate preview with parsed data
      const parsedRows: ParsedRow[] = parseResult.rows.map((row, index) => {
        const errors: string[] = [];
        
        // Parse date
        const dateStr = row[columnMapping.date];
        const parsedDate = parseDate(dateStr, dateFormat);
        if (!parsedDate) {
          errors.push(`Invalid date: "${dateStr}"`);
        }
        
        // Parse description
        const description = row[columnMapping.description]?.trim() || null;
        if (!description) {
          errors.push('Missing description');
        }
        
        // Parse amount
        const amountStr = row[columnMapping.amount];
        let parsedAmount: number | null = null;
        if (amountStr) {
          // Remove currency symbols and whitespace, handle all commas globally
          const cleanAmount = amountStr.replace(/[^0-9.\-,]/g, '').replace(/,/g, '');
          parsedAmount = parseFloat(cleanAmount);
          if (isNaN(parsedAmount)) {
            errors.push(`Invalid amount: "${amountStr}"`);
            parsedAmount = null;
          }
        } else {
          errors.push('Missing amount');
        }
        
        return {
          rowIndex: index,
          raw: row,
          parsed: {
            date: parsedDate,
            description,
            amount: parsedAmount,
          },
          errors,
          isDuplicate: false, // Will be checked server-side
          isSelected: errors.length === 0, // Auto-select valid rows
        };
      });
      
      // Check for duplicates via API
      const response = await fetch('/api/transactions/check-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactions: parsedRows
            .filter(r => r.parsed.date && r.parsed.amount !== null)
            .map(r => ({
              date: r.parsed.date,
              amount: r.parsed.amount,
              description: r.parsed.description,
              rowIndex: r.rowIndex,
            })),
        }),
      });
      
      if (response.ok) {
        const { duplicates } = await response.json();
        const duplicateSet = new Set(duplicates as number[]);
        
        for (const row of parsedRows) {
          if (duplicateSet.has(row.rowIndex)) {
            row.isDuplicate = true;
            row.isSelected = false; // Deselect duplicates by default
          }
        }
      }
      
      const duplicateCount = parsedRows.filter(r => r.isDuplicate).length;
      const errorCount = parsedRows.filter(r => r.errors.length > 0).length;
      const validCount = parsedRows.filter(r => r.errors.length === 0 && !r.isDuplicate).length;
      
      setPreview({
        headers: parseResult.headers,
        rows: parsedRows,
        suggestedMapping: columnMapping,
        detectedDateFormat: dateFormat,
        duplicateCount,
        validCount,
        errorCount,
      });
      
      setCurrentStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate preview');
    } finally {
      setIsLoading(false);
    }
  }, [parseResult, columnMapping, dateFormat]);

  // Step 3: Toggle row selection - use functional update to avoid stale closure
  const handleRowToggle = useCallback((rowIndex: number) => {
    setPreview(prev => {
      if (!prev) return prev;
      
      const newRows = prev.rows.map(row => {
        if (row.rowIndex === rowIndex) {
          return { ...row, isSelected: !row.isSelected };
        }
        return row;
      });
      
      return { ...prev, rows: newRows };
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setPreview(prev => {
      if (!prev) return prev;
      
      const newRows = prev.rows.map(row => ({
        ...row,
        isSelected: row.errors.length === 0, // Only select rows without errors
      }));
      
      return { ...prev, rows: newRows };
    });
  }, []);

  const handleDeselectAll = useCallback(() => {
    setPreview(prev => {
      if (!prev) return prev;
      
      const newRows = prev.rows.map(row => ({
        ...row,
        isSelected: false,
      }));
      
      return { ...prev, rows: newRows };
    });
  }, []);

  // Step 3: Import selected transactions
  const handleImport = useCallback(async () => {
    if (!preview) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const selectedRows = preview.rows.filter(r => r.isSelected && r.errors.length === 0);
      
      const transactions = selectedRows.map(row => ({
        date: row.parsed.date!,
        description: row.parsed.description!,
        amount: row.parsed.amount!,
      }));
      
      const response = await fetch('/api/transactions/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Import failed');
      }
      
      const result = await response.json() as ImportResult;
      setImportResult(result);
      setCurrentStep('complete');
      onComplete?.(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setIsLoading(false);
    }
  }, [preview, onComplete]);

  const handleReset = () => {
    setCurrentStep('upload');
    setParseResult(null);
    setColumnMapping({ date: -1, description: -1, amount: -1, ignore: [] });
    setDateFormat('auto');
    setPreview(null);
    setError(null);
    setImportResult(null);
  };

  const currentStepIndex = steps.findIndex(s => s.id === currentStep);

  return (
    <Card className="w-full max-w-4xl mx-auto bg-slate-900 border-slate-700">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/20 rounded-lg">
            <FileSpreadsheet className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <CardTitle className="text-slate-100">Import Transactions</CardTitle>
            <CardDescription className="text-slate-400">
              Import transactions from a CSV file
            </CardDescription>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-2 mt-6">
          {steps.map((step, index) => (
            <React.Fragment key={step.id}>
              <div
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-colors',
                  index === currentStepIndex
                    ? 'bg-emerald-500/20 text-emerald-400 font-medium'
                    : index < currentStepIndex
                      ? 'text-emerald-400'
                      : 'text-slate-500'
                )}
              >
                <div
                  className={cn(
                    'w-5 h-5 rounded-full flex items-center justify-center text-xs',
                    index === currentStepIndex
                      ? 'bg-emerald-500 text-white'
                      : index < currentStepIndex
                        ? 'bg-emerald-500/30 text-emerald-400'
                        : 'bg-slate-700 text-slate-500'
                  )}
                >
                  {index < currentStepIndex ? (
                    <CheckCircle className="w-3 h-3" />
                  ) : (
                    index + 1
                  )}
                </div>
                <span className="hidden sm:inline">{step.label}</span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    'flex-1 h-0.5 max-w-8',
                    index < currentStepIndex ? 'bg-emerald-500/50' : 'bg-slate-700'
                  )}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      </CardHeader>

      <CardContent>
        {/* Step: Upload */}
        {currentStep === 'upload' && (
          <FileUpload
            onFileSelect={handleFileSelect}
            isLoading={isLoading}
            error={error}
          />
        )}

        {/* Step: Column Mapping */}
        {currentStep === 'mapping' && parseResult && (
          <ColumnMappingComponent
            parseResult={parseResult}
            mapping={columnMapping}
            dateFormat={dateFormat}
            onMappingChange={setColumnMapping}
            onDateFormatChange={setDateFormat}
            onContinue={handleMappingContinue}
            onBack={() => setCurrentStep('upload')}
          />
        )}

        {/* Step: Preview */}
        {currentStep === 'preview' && preview && (
          <PreviewTable
            preview={preview}
            onRowToggle={handleRowToggle}
            onSelectAll={handleSelectAll}
            onDeselectAll={handleDeselectAll}
            onContinue={handleImport}
            onBack={() => setCurrentStep('mapping')}
            isLoading={isLoading}
          />
        )}

        {/* Step: Complete */}
        {currentStep === 'complete' && importResult && (
          <div className="text-center py-8 space-y-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/20">
              <CheckCircle className="w-8 h-8 text-emerald-400" />
            </div>
            
            <div>
              <h3 className="text-xl font-semibold text-slate-100 mb-2">
                Import Complete!
              </h3>
              <p className="text-slate-400">
                Successfully imported {importResult.imported} transaction{importResult.imported !== 1 ? 's' : ''}
              </p>
            </div>
            
            <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto">
              <div className="p-3 bg-emerald-500/10 rounded-lg">
                <p className="text-2xl font-semibold text-emerald-400">{importResult.imported}</p>
                <p className="text-xs text-slate-400">Imported</p>
              </div>
              <div className="p-3 bg-amber-500/10 rounded-lg">
                <p className="text-2xl font-semibold text-amber-400">{importResult.duplicates}</p>
                <p className="text-xs text-slate-400">Duplicates</p>
              </div>
              <div className="p-3 bg-slate-700 rounded-lg">
                <p className="text-2xl font-semibold text-slate-300">{importResult.skipped}</p>
                <p className="text-xs text-slate-400">Skipped</p>
              </div>
            </div>
            
            <div className="flex justify-center gap-3 pt-4">
              <Button variant="outline" onClick={handleReset}>
                Import More
              </Button>
              {onCancel && (
                <Button onClick={onCancel} className="bg-emerald-600 hover:bg-emerald-700">
                  Done
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Cancel button */}
        {onCancel && currentStep !== 'complete' && (
          <div className="mt-6 pt-4 border-t border-slate-700">
            <Button variant="ghost" onClick={onCancel} className="text-slate-400">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Cancel Import
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

