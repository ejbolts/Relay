import { useEffect, useRef, useState } from 'react';

export function PaginationControls({
  currentPage,
  totalPages,
  onPageChange,
  label,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  label: string;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const paginationRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;

    const closePicker = (event: PointerEvent) => {
      if (!paginationRef.current?.contains(event.target as Node)) setPickerOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPickerOpen(false);
    };

    document.addEventListener('pointerdown', closePicker);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closePicker);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [pickerOpen]);

  if (totalPages <= 1) return null;

  const selectPage = (page: number) => {
    onPageChange(Math.min(totalPages, Math.max(1, page)));
    setPickerOpen(false);
  };

  return (
    <nav className="pagination-controls" aria-label={`${label} pagination`} ref={paginationRef}>
      <button
        type="button"
        className="pagination-arrow"
        disabled={currentPage === 1}
        onClick={() => selectPage(currentPage - 1)}
        aria-label={`Previous ${label} page`}
      >
        <span aria-hidden="true">←</span>
      </button>
      <div className="pagination-picker">
        <button
          type="button"
          className="pagination-more"
          onClick={() => setPickerOpen((open) => !open)}
          aria-label={`Choose a ${label} page`}
          aria-haspopup="true"
          aria-expanded={pickerOpen}
        >
          {/* The page itself, so the button says where you are and that it picks a page. */}
          <span className="pagination-current num" aria-hidden="true">
            {currentPage}
            <small> / {totalPages}</small>
          </span>
        </button>
        {pickerOpen && (
          <div className="pagination-page-menu" role="group" aria-label={`${label} pages`}>
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
              <button
                type="button"
                key={page}
                className={page === currentPage ? 'active' : ''}
                onClick={() => selectPage(page)}
                aria-current={page === currentPage ? 'page' : undefined}
                aria-label={`Go to page ${page}`}
              >
                {page}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        className="pagination-arrow"
        disabled={currentPage === totalPages}
        onClick={() => selectPage(currentPage + 1)}
        aria-label={`Next ${label} page`}
      >
        <span aria-hidden="true">→</span>
      </button>
      <small className="pagination-status sr-only" aria-live="polite">
        Page {currentPage} of {totalPages}
      </small>
    </nav>
  );
}
