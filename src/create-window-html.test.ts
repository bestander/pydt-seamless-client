import { describe, expect, it } from 'vitest';
import vm from 'node:vm';
import { windowHtml } from './create-window-html';
import type { CreateDraft } from './create-logic';

const draft: CreateDraft = {
  gameName: 'Evil </script><b>name</b>',
  owner: { id: 'o', name: 'Owner' },
  seats: [{ index: 0, civilization: 'Rome', leader: 'Trajan', playerName: '</script><script>alert(1)</script>', match: { id: 'o', name: 'Owner' }, matchedBy: 'search' }],
  rulesets: [{ source: 'featured', pin: { featured: 'classic' }, label: 'Classic (featured)', ok: true }, { source: 'builtin', pin: { builtin: 'blitz' }, label: 'blitz', ok: false, error: 'x' }],
  defaultPin: { featured: 'classic' },
  warnings: ['one'],
};

describe('the create window page', () => {
  const html = windowHtml(draft, 'civa-create-1');

  it('has script that parses, and no data can close the script tag early', () => {
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    expect(scripts).toHaveLength(1);
    expect(() => new vm.Script(scripts[0]![1]!)).not.toThrow();
    expect(html).not.toContain('<script>alert(1)');
  });

  it('escapes the game name in the page text', () => {
    expect(html).toContain('Create "Evil &lt;/script&gt;&lt;b&gt;name&lt;/b&gt;" in Civa');
  });

  it('offers the mode, the ruleset choice and every seat control', () => {
    expect(html).toContain('value="mirror" checked');
    expect(html).toContain('value="playable"');
    expect(html).toContain('id="pin"');
    expect(html).toContain('Search Civa players');
  });
});
