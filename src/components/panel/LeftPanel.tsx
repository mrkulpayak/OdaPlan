import { memo, useState } from 'react';
import { useUiStore } from '../../store/uiStore';
import { ChevronRight } from 'lucide-react';
import { RoomSection } from './RoomSection';
import { FurnitureSection } from './FurnitureSection';
import { DoorsWindowsSection } from './DoorsWindowsSection';
import { FavoritesSection } from './FavoritesSection';
import { AddProductModal } from '../modals/AddProductModal';

type SectionId = 'room' | 'doors-windows' | 'furniture' | 'favorites' | 'add-product';

const sections: { id: SectionId; label: string }[] = [
  { id: 'room', label: 'Room' },
  { id: 'doors-windows', label: 'Doors & Windows' },
  { id: 'furniture', label: 'Furniture' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'add-product', label: 'Add New Product' },
];

function SectionContent({ id, dealerId }: { id: SectionId; dealerId: string }) {
  if (id === 'room') return <RoomSection />;
  if (id === 'doors-windows') return <DoorsWindowsSection />;
  if (id === 'furniture') return <FurnitureSection dealerId={dealerId} />;
  if (id === 'favorites') return <FavoritesSection />;
  return null;
}

interface Props {
  dealerId: string;
}

export const LeftPanel = memo(function LeftPanel({ dealerId }: Props) {
  const { activeSection, setActiveSection } = useUiStore();
  const [showAddModal, setShowAddModal] = useState(false);

  const toggle = (id: SectionId) => {
    if (id === 'add-product') {
      setShowAddModal(true);
      return;
    }
    setActiveSection(activeSection === id ? null : id);
  };

  return (
    <>
      <div
        id="left-panel"
        className="flex flex-col border-r border-border bg-surface overflow-y-auto"
        style={{ width: '280px', minWidth: '280px', flexShrink: 0 }}
      >
        {sections.map((section) => {
          const isOpen = activeSection === section.id;
          const isAction = section.id === 'add-product';
          return (
            <div key={section.id}>
              <button
                onClick={() => toggle(section.id)}
                className="flex items-center justify-between w-full px-4 cursor-pointer hover:bg-surface-alt transition-colors duration-base border-b border-border"
                style={{
                  height: '40px',
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--text-base)',
                  fontWeight: 'var(--font-weight-medium)',
                  color: isAction ? 'var(--color-primary)' : 'var(--color-text)',
                  background: 'var(--color-surface)',
                }}
              >
                <span>{section.label}</span>
                {!isAction && (
                  <ChevronRight
                    size={16}
                    className="transition-transform duration-base text-text-muted"
                    style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
                  />
                )}
              </button>
              {isOpen && !isAction && (
                <div className="border-b border-border">
                  <SectionContent id={section.id} dealerId={dealerId} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showAddModal && (
        <AddProductModal dealerId={dealerId} onClose={() => setShowAddModal(false)} />
      )}
    </>
  );
});
