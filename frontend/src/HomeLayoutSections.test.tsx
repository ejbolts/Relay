import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HomeLayoutSections } from './HomeLayoutSections';
import { defaultHomeLayout, HOME_SECTIONS, type HomeSectionId } from './homeLayout';

describe('Home layout rendering', () => {
  const sections = Object.fromEntries(
    HOME_SECTIONS.map(({ id }) => [id, <p key={id}>{id}</p>]),
  ) as Record<HomeSectionId, React.ReactNode>;

  it('keeps Combined visible and offers independent Body weight and Body fat sections to add', () => {
    const markup = renderToStaticMarkup(
      <HomeLayoutSections
        layout={defaultHomeLayout()}
        sections={sections}
        edit={{ onChange: vi.fn(), saving: false }}
      />,
    );
    expect(markup).toContain('data-home-section="combined-check-in"');
    expect(markup).not.toContain('data-home-section="bodyweight-check-in"');
    expect(markup).not.toContain('data-home-section="body-fat-check-in"');
    expect(markup).toContain('aria-label="Add Body weight check-in"');
    expect(markup).toContain('aria-label="Add Body fat check-in"');
    expect(markup).not.toContain('Daily check-in');
  });

  it('renders saved order, hides cards, and skips the active-workout placeholder', () => {
    const layout = defaultHomeLayout();
    layout.order.reverse();
    layout.hidden = ['consistency'];
    const markup = renderToStaticMarkup(
      <HomeLayoutSections layout={layout} sections={{ ...sections, 'next-workout': null }} />,
    );
    expect(markup.indexOf('data-home-section="records"')).toBeLessThan(
      markup.indexOf('data-home-section="workouts"'),
    );
    expect(markup).not.toContain('data-home-section="consistency"');
    expect(markup).not.toContain('data-home-section="next-workout"');
  });

  it('keeps a recovery instruction when everything is hidden', () => {
    const layout = defaultHomeLayout();
    layout.hidden = [...layout.order];
    expect(
      renderToStaticMarkup(<HomeLayoutSections layout={layout} sections={sections} />),
    ).toContain('Use the edit button to add sections');
  });

  it('edits the actual cards, locks their content, and exposes hide/drag controls', () => {
    const layout = defaultHomeLayout();
    layout.hidden = ['consistency'];
    const markup = renderToStaticMarkup(
      <HomeLayoutSections
        layout={layout}
        sections={sections}
        edit={{ onChange: vi.fn(), saving: false }}
      />,
    );
    expect(markup).toContain('aria-label="Drag Next workout to reorder"');
    expect(markup).toContain('aria-label="Hide Workouts"');
    expect(markup).toContain('aria-label="Expand Workouts to full width"');
    expect(markup).toContain('aria-label="Shrink Combined check-in to compact width"');
    expect(markup).toContain('class="home-section-content" inert=""');
    expect(markup).toContain('<p>workouts</p>');
    expect(markup).not.toContain('data-home-section="consistency"');
    expect(markup).not.toContain('home-layout-list');
    expect(markup).toContain('aria-label="Add Consistency"');
    expect(markup).toContain('Add sections');
    expect(markup).not.toContain('home-layout-toolbar');
    expect(markup).not.toContain('Save layout');
  });

  it('keeps editing controls out of the normal cards', () => {
    const markup = renderToStaticMarkup(
      <HomeLayoutSections layout={defaultHomeLayout()} sections={sections} />,
    );
    expect(markup).not.toContain('inert=""');
    expect(markup).not.toContain('home-drag-handle');
    expect(markup).not.toContain('home-card-hide');
    expect(markup).not.toContain('home-card-resize');
  });

  it('leaves out next workout while editing during an active workout', () => {
    const markup = renderToStaticMarkup(
      <HomeLayoutSections
        layout={defaultHomeLayout()}
        sections={{ ...sections, 'next-workout': null }}
        edit={{ onChange: vi.fn(), saving: false }}
      />,
    );
    expect(markup).not.toContain('data-home-section="next-workout"');
    expect(markup).not.toContain('aria-label="Hide Next workout"');
    expect(markup).toContain('aria-label="Hide Consistency"');
  });

  it('offers Customise only for sections with options, and only while editing', () => {
    const customisers = { zone2: <p>Cardio options</p> };
    const editing = renderToStaticMarkup(
      <HomeLayoutSections
        layout={defaultHomeLayout()}
        sections={sections}
        customisers={customisers}
        edit={{ onChange: vi.fn(), saving: false }}
      />,
    );
    expect(editing.match(/home-card-customise/g)).toHaveLength(1);
    expect(editing).toContain('aria-label="Customise Cardio zone goals"');
    expect(
      renderToStaticMarkup(
        <HomeLayoutSections
          layout={defaultHomeLayout()}
          sections={sections}
          customisers={customisers}
        />,
      ),
    ).not.toContain('Customise');
  });
});
