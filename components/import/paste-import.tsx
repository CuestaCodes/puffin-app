'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { api } from '@/lib/services';
import { toast } from 'sonner';
import {
  ClipboardPaste,
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  AlertTriangle,
  Loader2,
  FileText,
  Table2,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { parsePastedText, detectPasteColumnMapping, parseAmount } from '@/lib/paste/parser';
import { parseDate, detectDateFormat } from '@/lib/csv/date-parser';
import { cn } from '@/lib/utils';
import { saveLastImport, clearLastImport } from '@/lib/import-undo';
import type {
  CSVParseResult,
  ColumnMapping,
  DateFormat,
  ImportPreview,
  ParsedRow,
  ImportResult
} from '@/types/import';
import type { Source } from '@/types/database';
import type { UndoImportResult } from '@/types/import';

type PasteStep = 'paste' | 'mapping' | 'preview' | 'complete';

interface PasteImportProps {
  onComplete?: (result: ImportResult) => void;
  onCancel?: () => void;
}

const steps: { id: PasteStep; label: string }[] = [
  { id: 'paste', label: 'Paste' },
  { id: 'mapping', label: 'Map Columns' },
  { id: 'preview', label: 'Preview' },
  { id: 'complete', label: 'Complete' },
];

export function PasteImport({ onComplete, onCancel }: PasteImportProps) {
  const [currentStep, setCurrentStep] = useState<PasteStep>('paste');
  const [pastedText, setPastedText] = useState('');
  const [parseResult, setParseResult] = useState<CSVParseResult | null>(null);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({
    date: -1,
    description: -1,
    amount: -1,
    debit: undefined,
    credit: undefined,
    ignore: [],
  });
  // Track if we're using debit/credit mode vs single amount
  const useDebitCreditMode = columnMapping.debit !== undefined || columnMapping.credit !== undefined;
  const [dateFormat, setDateFormat] = useState<DateFormat>('auto');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [treatAsExpenses, setTreatAsExpenses] = useState(true);
  const [hasHeaders, setHasHeaders] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch sources on mount
  useEffect(() => {
    const fetchSources = async () => {
      try {
        const result = await api.get<{ sources: Source[] }>('/api/sources');
        if (result.data) {
          setSources(result.data.sources || []);
        }
      } catch (err) {
        console.error('Failed to fetch sources:', err);
      }
    };
    fetchSources();
  }, []);

  // Parse pasted text
  const handleParse = useCallback(() => {
    if (!pastedText.trim()) {
      setError('Please paste some transaction data first');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = parsePastedText(pastedText, { hasHeaders });
      setParseResult(result);

      // Auto-detect column mapping
      const detectedMapping = detectPasteColumnMapping(result.headers, result.rows);
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
      setError(err instanceof Error ? err.message : 'Failed to parse pasted text');
    } finally {
      setIsLoading(false);
    }
  }, [pastedText, hasHeaders]);

  // Generate preview from parse result and column mapping
  const generatePreview = useCallback(async () => {
    if (!parseResult) return;

    setIsLoading(true);
    setError(null);
    // Reset to treating as expenses by default
    setTreatAsExpenses(true);

    try {
      // Parse rows with mapping
      const parsedRows: ParsedRow[] = parseResult.rows.map((row, index) => {
        const errors: string[] = [];

        // Extract values based on mapping
        const rawDate = columnMapping.date >= 0 ? row[columnMapping.date] : '';
        const rawDesc = columnMapping.description >= 0 ? row[columnMapping.description] : '';

        // Parse date
        let parsedDate: string | null = null;
        if (rawDate) {
          const dateResult = parseDate(rawDate, dateFormat);
          if (dateResult) {
            parsedDate = dateResult;
          } else {
            errors.push(`Invalid date: ${rawDate}`);
          }
        } else {
          errors.push('Missing date');
        }

        // Parse amount - handle both single amount and debit/credit modes
        let parsedAmount: number | null = null;

        if ((columnMapping.debit !== undefined && columnMapping.debit >= 0) ||
            (columnMapping.credit !== undefined && columnMapping.credit >= 0)) {
          // Debit/Credit mode: combine both columns
          const rawDebit = columnMapping.debit !== undefined && columnMapping.debit >= 0 ? row[columnMapping.debit] : '';
          const rawCredit = columnMapping.credit !== undefined && columnMapping.credit >= 0 ? row[columnMapping.credit] : '';

          const debitAmount = rawDebit ? parseAmount(rawDebit) : null;
          const creditAmount = rawCredit ? parseAmount(rawCredit) : null;

          if (debitAmount !== null && debitAmount !== 0) {
            // Debit/withdrawal - make negative (expense)
            parsedAmount = -Math.abs(debitAmount);
          } else if (creditAmount !== null && creditAmount !== 0) {
            // Credit/deposit - keep positive (income)
            parsedAmount = Math.abs(creditAmount);
          } else if (!rawDebit && !rawCredit) {
            errors.push('Missing amount in both debit and credit columns');
          } else if (rawDebit && debitAmount === null) {
            errors.push(`Invalid debit amount: ${rawDebit}`);
          } else if (rawCredit && creditAmount === null) {
            errors.push(`Invalid credit amount: ${rawCredit}`);
          }
        } else {
          // Single amount mode
          const rawAmount = columnMapping.amount >= 0 ? row[columnMapping.amount] : '';
          if (rawAmount) {
            parsedAmount = parseAmount(rawAmount);
            if (parsedAmount === null) {
              errors.push(`Invalid amount: ${rawAmount}`);
            } else {
              // Default: treat as expense (negative)
              parsedAmount = -Math.abs(parsedAmount);
            }
          } else {
            errors.push('Missing amount');
          }
        }

        // Handle description
        const description = rawDesc?.trim() || null;
        const hasDefaultDescription = !description;

        return {
          rowIndex: index,
          raw: row,
          parsed: {
            date: parsedDate,
            description: description || 'No description',
            amount: parsedAmount,
            notes: null, // Paste import doesn't support notes mapping
          },
          errors,
          isDuplicate: false,
          isSelected: errors.length === 0,
          hasDefaultDescription,
        };
      });

      // Check for duplicates if we have valid rows
      const validRows = parsedRows.filter(r => r.errors.length === 0);
      if (validRows.length > 0) {
        try {
          const duplicateCheck = await api.post<{ duplicates: Array<{ date: string; description: string; amount: number }> }>(
            '/api/transactions/check-duplicates',
            {
              transactions: validRows.map(r => ({
                date: r.parsed.date,
                description: r.parsed.description,
                amount: r.parsed.amount,
              })),
            }
          );

          if (duplicateCheck.data?.duplicates) {
            const dupSet = new Set(
              duplicateCheck.data.duplicates.map(
                d => `${d.date}|${d.description}|${d.amount}`
              )
            );
            parsedRows.forEach(row => {
              const key = `${row.parsed.date}|${row.parsed.description}|${row.parsed.amount}`;
              if (dupSet.has(key)) {
                row.isDuplicate = true;
                row.isSelected = false;
              }
            });
          }
        } catch (err) {
          console.error('Duplicate check failed:', err);
        }
      }

      const duplicateCount = parsedRows.filter(r => r.isDuplicate).length;
      const validCount = parsedRows.filter(r => r.errors.length === 0 && !r.isDuplicate).length;
      const errorCount = parsedRows.filter(r => r.errors.length > 0).length;

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

  // Handle import
  const handleImport = async () => {
    if (!preview) return;

    const selectedRows = preview.rows.filter(r => r.isSelected && r.errors.length === 0);
    if (selectedRows.length === 0) {
      setError('No valid transactions selected for import');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const transactions = selectedRows.map(row => ({
        date: row.parsed.date,
        description: row.parsed.description,
        amount: row.parsed.amount,
        source_id: selectedSourceId,
      }));

      const result = await api.post<ImportResult>('/api/transactions/import', {
        transactions,
        skipDuplicates: true,
      });

      if (result.error) {
        throw new Error(result.error);
      }

      const importData = result.data || {
        success: true,
        imported: selectedRows.length,
        skipped: 0,
        duplicates: 0,
        autoCategorized: 0,
        errors: [],
      };

      setImportResult(importData);
      setCurrentStep('complete');

      // Save import info for undo functionality
      if (importData.batchId && importData.imported > 0) {
        const sourceName = selectedSourceId
          ? sources.find(s => s.id === selectedSourceId)?.name || null
          : null;

        saveLastImport({
          batchId: importData.batchId,
          timestamp: Date.now(),
          count: importData.imported,
          sourceName,
        });

        // Show toast with undo action
        toast.success(
          `Imported ${importData.imported} transaction${importData.imported !== 1 ? 's' : ''}`,
          {
            description: 'You can undo this import within 5 minutes',
            duration: 10000,
            action: {
              label: 'Undo',
              onClick: async () => {
                try {
                  const undoResult = await api.post<UndoImportResult>(
                    '/api/transactions/undo-import',
                    { batchId: importData.batchId, confirm: true }
                  );

                  if (undoResult.data?.success) {
                    clearLastImport();
                    toast.success(undoResult.data.message);
                    // Trigger a refresh
                    onComplete?.({ ...importData, imported: 0 });
                  } else {
                    toast.error('Failed to undo import');
                  }
                } catch {
                  toast.error('Failed to undo import');
                }
              },
            },
          }
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import transactions');
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle row selection
  const toggleRowSelection = (rowIndex: number) => {
    if (!preview) return;

    setPreview({
      ...preview,
      rows: preview.rows.map(row =>
        row.rowIndex === rowIndex
          ? { ...row, isSelected: !row.isSelected }
          : row
      ),
    });
  };

  // Select/deselect all valid rows
  const toggleAllSelection = (selected: boolean) => {
    if (!preview) return;

    setPreview({
      ...preview,
      rows: preview.rows.map(row => ({
        ...row,
        isSelected: row.errors.length === 0 && !row.isDuplicate ? selected : false,
      })),
    });
  };

  // Toggle between treating amounts as expenses or income (global)
  const toggleExpenseIncomeMode = () => {
    if (!preview) return;

    setTreatAsExpenses(!treatAsExpenses);
    setPreview({
      ...preview,
      rows: preview.rows.map(row => ({
        ...row,
        parsed: {
          ...row.parsed,
          amount: row.parsed.amount !== null ? -row.parsed.amount : null,
        },
      })),
    });
  };

  // Toggle individual row amount sign
  const toggleRowAmountSign = (rowIndex: number) => {
    if (!preview) return;

    setPreview({
      ...preview,
      rows: preview.rows.map(row =>
        row.rowIndex === rowIndex
          ? {
              ...row,
              parsed: {
                ...row.parsed,
                amount: row.parsed.amount !== null ? -row.parsed.amount : null,
              },
            }
          : row
      ),
    });
  };

  // Handle column mapping change
  const handleMappingChange = (field: 'date' | 'description' | 'amount' | 'debit' | 'credit', colIndex: number) => {
    setColumnMapping(prev => {
      const updated = { ...prev, [field]: colIndex === -1 ? undefined : colIndex };

      // If switching to debit/credit mode, clear single amount
      if ((field === 'debit' || field === 'credit') && colIndex !== -1) {
        updated.amount = -1;
      }
      // If switching to single amount mode, clear debit/credit
      if (field === 'amount' && colIndex !== -1) {
        updated.debit = undefined;
        updated.credit = undefined;
      }

      return updated;
    });
  };

  // Toggle between single amount and debit/credit mode
  const toggleAmountMode = () => {
    if (useDebitCreditMode) {
      // Switch to single amount - use first available amount column
      const amountCols = parseResult?.headers
        .map((h, i) => ({ header: h, index: i }))
        .filter(({ header }) =>
          /amount|withdraw|deposit|debit|credit/i.test(header)
        );
      setColumnMapping(prev => ({
        ...prev,
        amount: amountCols?.[0]?.index ?? -1,
        debit: undefined,
        credit: undefined,
      }));
    } else {
      // Switch to debit/credit mode - try to auto-detect
      const headers = parseResult?.headers || [];
      let debitIdx: number = -1;
      let creditIdx: number = -1;

      headers.forEach((h, i) => {
        const lower = h.toLowerCase();
        if (/withdraw|debit/i.test(lower)) debitIdx = i;
        if (/deposit|credit/i.test(lower)) creditIdx = i;
      });

      setColumnMapping(prev => ({
        ...prev,
        amount: -1,
        debit: debitIdx,
        credit: creditIdx,
      }));
    }
  };

  // Reset to start
  const handleReset = () => {
    setPastedText('');
    setParseResult(null);
    setPreview(null);
    setError(null);
    setCurrentStep('paste');
  };

  // Format currency for display
  const formatCurrency = (amount: number | null): string => {
    if (amount === null) return '-';
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
    }).format(amount);
  };

  // Get current step index
  const currentStepIndex = steps.findIndex(s => s.id === currentStep);

  return (
    <Card className="border-slate-800 bg-slate-900/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg text-slate-100 flex items-center gap-2">
              <ClipboardPaste className="w-5 h-5 text-cyan-400" />
              Import from Clipboard
            </CardTitle>
            <CardDescription className="text-slate-400">
              Copy a transaction table from a PDF statement and paste it here
            </CardDescription>
          </div>
          {onCancel && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              className="text-slate-400 hover:text-white"
            >
              Cancel
            </Button>
          )}
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-2 mt-4">
          {steps.map((step, index) => (
            <React.Fragment key={step.id}>
              <div
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                  index < currentStepIndex
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : index === currentStepIndex
                      ? 'bg-cyan-500/20 text-cyan-400'
                      : 'bg-slate-800 text-slate-500'
                )}
              >
                {index < currentStepIndex ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <span className="w-4 h-4 flex items-center justify-center text-xs">
                    {index + 1}
                  </span>
                )}
                <span className="hidden sm:inline">{step.label}</span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    'w-8 h-0.5',
                    index < currentStepIndex ? 'bg-emerald-500/50' : 'bg-slate-700'
                  )}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/50 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {/* Step 1: Paste */}
        {currentStep === 'paste' && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <h4 className="font-medium text-slate-200 mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4 text-cyan-400" />
                How to use
              </h4>
              <ol className="space-y-1 text-sm text-slate-400 list-decimal list-inside">
                <li>Open your PDF bank statement</li>
                <li>Select the transaction table (click and drag)</li>
                <li>Copy the selection (Ctrl+C or Cmd+C)</li>
                <li>Paste it in the text area below (Ctrl+V or Cmd+V)</li>
              </ol>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">Paste your transaction data</Label>
              <Textarea
                ref={textareaRef}
                value={pastedText}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPastedText(e.target.value)}
                placeholder="Paste your copied transaction table here...

Example:
01/15/2024    Coffee Shop          -4.50
01/15/2024    Grocery Store        -45.23
01/16/2024    Salary               2500.00"
                className="min-h-[300px] font-mono text-sm bg-slate-800/50 border-slate-700 text-slate-100 placeholder:text-slate-600"
              />
            </div>

            {pastedText && (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Table2 className="w-4 h-4" />
                <span>{pastedText.split('\n').filter(l => l.trim()).length} lines detected</span>
              </div>
            )}

            {/* First row contains headers toggle */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700">
              <Checkbox
                id="paste-has-headers"
                checked={hasHeaders}
                onCheckedChange={(checked) => setHasHeaders(!!checked)}
                aria-label="First row contains column headers"
              />
              <label
                htmlFor="paste-has-headers"
                className="text-sm text-slate-300 cursor-pointer"
              >
                First row contains column headers
              </label>
              {!hasHeaders && (
                <span className="text-xs text-amber-400 ml-auto">
                  All rows treated as data
                </span>
              )}
            </div>

            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={handleReset}
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
                disabled={!pastedText}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Clear
              </Button>
              <Button
                onClick={handleParse}
                disabled={!pastedText.trim() || isLoading}
                className="bg-cyan-600 hover:bg-cyan-500"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <ArrowRight className="w-4 h-4 mr-2" />
                )}
                Parse Data
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Column Mapping */}
        {currentStep === 'mapping' && parseResult && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-slate-200">Detected Data</h4>
                <Badge variant="outline" className="text-cyan-400 border-cyan-400/50">
                  {parseResult.totalRows} rows
                </Badge>
              </div>
              <p className="text-sm text-slate-400">
                We detected {parseResult.headers.length} columns. Please verify the mapping below.
              </p>
            </div>

            {/* Sample preview */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    {parseResult.headers.map((header, idx) => (
                      <th
                        key={idx}
                        className="px-3 py-2 text-left text-slate-400 font-medium"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parseResult.rows.slice(0, 3).map((row, rowIdx) => (
                    <tr key={rowIdx} className="border-b border-slate-800">
                      {row.map((cell, cellIdx) => (
                        <td key={cellIdx} className="px-3 py-2 text-slate-300">
                          {cell || <span className="text-slate-600">-</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Inline Column Mapping */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-slate-300">Date Column</Label>
                <Select
                  value={columnMapping.date.toString()}
                  onValueChange={(v) => handleMappingChange('date', parseInt(v))}
                >
                  <SelectTrigger className="bg-slate-800/50 border-slate-700 text-slate-100">
                    <SelectValue placeholder="Select column" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="-1">Not mapped</SelectItem>
                    {parseResult.headers.map((header, idx) => (
                      <SelectItem key={idx} value={idx.toString()}>
                        {header} (Col {idx + 1})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">Description Column</Label>
                <Select
                  value={columnMapping.description.toString()}
                  onValueChange={(v) => handleMappingChange('description', parseInt(v))}
                >
                  <SelectTrigger className="bg-slate-800/50 border-slate-700 text-slate-100">
                    <SelectValue placeholder="Select column" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="-1">Not mapped</SelectItem>
                    {parseResult.headers.map((header, idx) => (
                      <SelectItem key={idx} value={idx.toString()}>
                        {header} (Col {idx + 1})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Amount Mode Toggle */}
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-medium text-slate-200">Amount Columns</h4>
                  <p className="text-sm text-slate-400">
                    {useDebitCreditMode
                      ? 'Separate withdrawal/deposit columns (for tabbed data)'
                      : 'Single amount column (toggle expense/income in preview)'}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleAmountMode}
                  className="border-slate-600 text-slate-300 hover:bg-slate-700"
                >
                  {useDebitCreditMode ? 'Use Single Column' : 'Use Separate Columns'}
                </Button>
              </div>

              {useDebitCreditMode ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-slate-300">Withdrawals (Debits)</Label>
                    <Select
                      value={(columnMapping.debit ?? -1).toString()}
                      onValueChange={(v) => handleMappingChange('debit', parseInt(v))}
                    >
                      <SelectTrigger className="bg-slate-800/50 border-slate-700 text-slate-100">
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="-1">Not mapped</SelectItem>
                        {parseResult.headers.map((header, idx) => (
                          <SelectItem key={idx} value={idx.toString()}>
                            {header} (Col {idx + 1})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-slate-500">Values will be stored as negative (expenses)</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-300">Deposits (Credits)</Label>
                    <Select
                      value={(columnMapping.credit ?? -1).toString()}
                      onValueChange={(v) => handleMappingChange('credit', parseInt(v))}
                    >
                      <SelectTrigger className="bg-slate-800/50 border-slate-700 text-slate-100">
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="-1">Not mapped</SelectItem>
                        {parseResult.headers.map((header, idx) => (
                          <SelectItem key={idx} value={idx.toString()}>
                            {header} (Col {idx + 1})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-slate-500">Values will be stored as positive (income)</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label className="text-slate-300">Amount Column</Label>
                  <Select
                    value={columnMapping.amount.toString()}
                    onValueChange={(v) => handleMappingChange('amount', parseInt(v))}
                  >
                    <SelectTrigger className="bg-slate-800/50 border-slate-700 text-slate-100">
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="-1">Not mapped</SelectItem>
                      {parseResult.headers.map((header, idx) => (
                        <SelectItem key={idx} value={idx.toString()}>
                          {header} (Col {idx + 1})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Date format selection */}
            <div className="space-y-2">
              <Label className="text-slate-300">Date Format</Label>
              <Select value={dateFormat} onValueChange={(v) => setDateFormat(v as DateFormat)}>
                <SelectTrigger className="w-full bg-slate-800/50 border-slate-700 text-slate-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="auto">Auto-detect</SelectItem>
                  <SelectItem value="YYYY-MM-DD">YYYY-MM-DD (2024-01-15)</SelectItem>
                  <SelectItem value="DD/MM/YYYY">DD/MM/YYYY (15/01/2024)</SelectItem>
                  <SelectItem value="MM/DD/YYYY">MM/DD/YYYY (01/15/2024)</SelectItem>
                  <SelectItem value="DD-MM-YYYY">DD-MM-YYYY (15-01-2024)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Source selection */}
            <div className="space-y-2">
              <Label className="text-slate-300">Source (Optional)</Label>
              <Select
                value={selectedSourceId || 'none'}
                onValueChange={(v) => setSelectedSourceId(v === 'none' ? null : v)}
              >
                <SelectTrigger className="w-full bg-slate-800/50 border-slate-700 text-slate-100">
                  <SelectValue placeholder="Select a source..." />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="none">No source</SelectItem>
                  {sources.map((source) => (
                    <SelectItem key={source.id} value={source.id}>
                      {source.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={() => setCurrentStep('paste')}
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button
                onClick={generatePreview}
                disabled={
                  isLoading ||
                  columnMapping.date === -1 ||
                  (!useDebitCreditMode && columnMapping.amount === -1) ||
                  (useDebitCreditMode && (columnMapping.debit === undefined || columnMapping.debit < 0) && (columnMapping.credit === undefined || columnMapping.credit < 0))
                }
                className="bg-cyan-600 hover:bg-cyan-500"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <ArrowRight className="w-4 h-4 mr-2" />
                )}
                Preview
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Preview */}
        {currentStep === 'preview' && preview && (
          <div className="space-y-4">
            {/* Summary badges and amount type toggle */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="text-emerald-400 border-emerald-400/50">
                  {preview.validCount} valid
                </Badge>
                {preview.duplicateCount > 0 && (
                  <Badge variant="outline" className="text-amber-400 border-amber-400/50">
                    {preview.duplicateCount} duplicates
                  </Badge>
                )}
                {preview.errorCount > 0 && (
                  <Badge variant="outline" className="text-red-400 border-red-400/50">
                    {preview.errorCount} errors
                  </Badge>
                )}
              </div>
              {!useDebitCreditMode && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Click amounts to toggle individually</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleExpenseIncomeMode}
                    className={cn(
                      'border-slate-600 hover:bg-slate-700',
                      treatAsExpenses ? 'text-red-400' : 'text-emerald-400'
                    )}
                  >
                    {treatAsExpenses ? 'All Expenses' : 'All Income'}
                  </Button>
                </div>
              )}
            </div>

            {/* Selection controls */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="select-all"
                  checked={preview.rows.filter(r => r.errors.length === 0 && !r.isDuplicate).every(r => r.isSelected)}
                  onCheckedChange={(checked) => toggleAllSelection(checked === true)}
                />
                <Label htmlFor="select-all" className="text-slate-300 text-sm">
                  Select all valid
                </Label>
              </div>
              <span className="text-sm text-slate-500">
                {preview.rows.filter(r => r.isSelected).length} selected for import
              </span>
            </div>

            {/* Preview Table */}
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-900">
                  <tr className="border-b border-slate-700">
                    <th className="px-2 py-2 text-left text-slate-400 font-medium w-10"></th>
                    <th className="px-3 py-2 text-left text-slate-400 font-medium">Date</th>
                    <th className="px-3 py-2 text-left text-slate-400 font-medium">Description</th>
                    <th className="px-3 py-2 text-right text-slate-400 font-medium">Amount</th>
                    <th className="px-3 py-2 text-left text-slate-400 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr
                      key={row.rowIndex}
                      className={cn(
                        'border-b border-slate-800 transition-colors',
                        row.isDuplicate && 'bg-amber-500/5',
                        row.errors.length > 0 && 'bg-red-500/5',
                        row.isSelected && 'bg-cyan-500/5'
                      )}
                    >
                      <td className="px-2 py-2">
                        <Checkbox
                          checked={row.isSelected}
                          disabled={row.errors.length > 0 || row.isDuplicate}
                          onCheckedChange={() => toggleRowSelection(row.rowIndex)}
                        />
                      </td>
                      <td className="px-3 py-2 text-slate-300">
                        {row.parsed.date || <span className="text-red-400">Invalid</span>}
                      </td>
                      <td className="px-3 py-2 text-slate-300 max-w-[300px] truncate">
                        {row.parsed.description}
                        {row.hasDefaultDescription && (
                          <span className="text-slate-500 text-xs ml-1">(default)</span>
                        )}
                      </td>
                      <td className={cn(
                        'px-3 py-2 text-right font-mono',
                        row.parsed.amount === null
                          ? 'text-red-400'
                          : row.parsed.amount < 0
                            ? 'text-red-400'
                            : 'text-emerald-400'
                      )}>
                        {!useDebitCreditMode && row.parsed.amount !== null && row.errors.length === 0 ? (
                          <button
                            onClick={() => toggleRowAmountSign(row.rowIndex)}
                            className="hover:bg-slate-700/50 px-2 py-0.5 rounded transition-colors"
                            title="Click to toggle expense/income"
                          >
                            {formatCurrency(row.parsed.amount)}
                          </button>
                        ) : (
                          formatCurrency(row.parsed.amount)
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {row.errors.length > 0 ? (
                          <span className="text-red-400 text-xs">{row.errors[0]}</span>
                        ) : row.isDuplicate ? (
                          <Badge variant="outline" className="text-amber-400 border-amber-400/50 text-xs">
                            Duplicate
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-emerald-400 border-emerald-400/50 text-xs">
                            Valid
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={() => setCurrentStep('mapping')}
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button
                onClick={handleImport}
                disabled={isLoading || preview.rows.filter(r => r.isSelected).length === 0}
                className="bg-emerald-600 hover:bg-emerald-500"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4 mr-2" />
                )}
                Import {preview.rows.filter(r => r.isSelected).length} Transactions
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Complete */}
        {currentStep === 'complete' && importResult && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-emerald-400" />
              </div>
              <h3 className="text-xl font-semibold text-slate-100 mb-2">Import Complete!</h3>
              <p className="text-slate-400">
                Successfully imported {importResult.imported} transactions
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700 text-center">
                <div className="text-2xl font-bold text-emerald-400">{importResult.imported}</div>
                <div className="text-sm text-slate-400">Imported</div>
              </div>
              {importResult.autoCategorized > 0 && (
                <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700 text-center">
                  <div className="text-2xl font-bold text-cyan-400">{importResult.autoCategorized}</div>
                  <div className="text-sm text-slate-400">Auto-categorised</div>
                </div>
              )}
              {importResult.duplicates > 0 && (
                <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700 text-center">
                  <div className="text-2xl font-bold text-amber-400">{importResult.duplicates}</div>
                  <div className="text-sm text-slate-400">Duplicates skipped</div>
                </div>
              )}
              {importResult.skipped > 0 && (
                <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700 text-center">
                  <div className="text-2xl font-bold text-slate-400">{importResult.skipped}</div>
                  <div className="text-sm text-slate-400">Skipped</div>
                </div>
              )}
            </div>

            <div className="flex justify-center gap-3">
              <Button
                variant="outline"
                onClick={handleReset}
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Import More
              </Button>
              <Button
                onClick={() => onComplete?.(importResult)}
                className="bg-emerald-600 hover:bg-emerald-500"
              >
                Done
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
