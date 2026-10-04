'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { RuleDialog } from '@/components/rules';
import { TransactionForm } from './transaction-form';
import { DeleteDialog } from './delete-dialog';
import { SplitModal } from './split-modal';
import type { TransactionList } from './use-transaction-list';

interface TransactionListDialogsProps {
  list: TransactionList;
  /** Date a new transaction starts on (YYYY-MM-DD). Ignored when editing or duplicating. */
  defaultDate?: string;
}

/**
 * Every dialog a transaction list's row actions open. Shared by the Transactions page
 * and the Monthly Budget list; requires `CategoryProvider`.
 */
export function TransactionListDialogs({ list, defaultDate }: TransactionListDialogsProps) {
  const {
    showTransactionForm,
    handleTransactionFormOpenChange,
    editingTransaction,
    duplicatingTransaction,
    deletingTransaction,
    setDeletingTransaction,
    splittingTransaction,
    setSplittingTransaction,
    creatingRuleFromTransaction,
    setCreatingRuleFromTransaction,
    handleTransactionSaved,
    handleTransactionDeleted,
    handleSplitSuccess,
    handleRuleCreated,
    confirmBulkDelete,
    showBulkDeleteConfirm,
    setShowBulkDeleteConfirm,
    bulkDeleteCount,
    isBulkDeleting,
    pendingBulkCategory,
    setPendingBulkCategory,
    confirmBulkCategory,
  } = list;

  const bulkCategoryCount = pendingBulkCategory?.ids.length ?? 0;
  const overwriteCount = pendingBulkCategory?.overwriteCount ?? 0;
  const removingCategory = pendingBulkCategory?.categoryId === null;

  return (
    <>
      {/* Transaction Form Modal */}
      <TransactionForm
        open={showTransactionForm}
        onOpenChange={handleTransactionFormOpenChange}
        transaction={editingTransaction}
        duplicateFrom={duplicatingTransaction}
        onSuccess={handleTransactionSaved}
        defaultDate={defaultDate}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteDialog
        open={!!deletingTransaction}
        onOpenChange={(open) => !open && setDeletingTransaction(null)}
        transaction={deletingTransaction}
        onSuccess={handleTransactionDeleted}
      />

      {/* Split Transaction Modal */}
      <SplitModal
        open={!!splittingTransaction}
        onOpenChange={(open) => !open && setSplittingTransaction(null)}
        transaction={splittingTransaction}
        onSuccess={handleSplitSuccess}
      />

      {/* Create Rule from Transaction Dialog */}
      <RuleDialog
        open={!!creatingRuleFromTransaction}
        onOpenChange={(open) => !open && setCreatingRuleFromTransaction(null)}
        defaultMatchText={creatingRuleFromTransaction?.description || ''}
        defaultCategoryId={creatingRuleFromTransaction?.sub_category_id || ''}
        onSuccess={handleRuleCreated}
      />

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-100">
              Delete {bulkDeleteCount} transaction{bulkDeleteCount !== 1 ? 's' : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              {bulkDeleteCount === 1 ? 'It' : 'They'} will be removed from your view.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 text-slate-300 hover:bg-slate-800">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // Keep the dialog up until the deletes resolve, so it cannot be
                // dismissed while the requests are still in flight
                e.preventDefault();
                confirmBulkDelete();
              }}
              disabled={isBulkDeleting}
              className="bg-red-600 hover:bg-red-500 text-white"
            >
              {isBulkDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Categorise Confirmation Dialog */}
      <AlertDialog
        open={!!pendingBulkCategory}
        onOpenChange={(open) => !open && setPendingBulkCategory(null)}
      >
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-100">
              {removingCategory
                ? `Remove the category from ${bulkCategoryCount} transactions?`
                : `Change the category of ${bulkCategoryCount} transactions?`}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              {overwriteCount} of the other selected transactions already{' '}
              {overwriteCount === 1 ? 'has' : 'have'} a category, which will be{' '}
              {removingCategory ? 'removed' : 'replaced'}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 text-slate-300 hover:bg-slate-800">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkCategory}
              className="bg-cyan-600 hover:bg-cyan-500 text-white"
            >
              {removingCategory ? 'Remove category' : 'Change category'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
