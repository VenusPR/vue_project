/* eslint-env jest */
import { sandbox } from './helpers'
import { createNextDescribe, FileRef } from 'e2e-utils'
import path from 'path'

// https://github.com/facebook/react/blob/main/packages/react-dom/src/__tests__/ReactDOMHydrationDiff-test.js used as a reference
createNextDescribe(
  'Error overlay for hydration errors',
  {
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    dependencies: {
      react: 'latest',
      'react-dom': 'latest',
    },
    skipStart: true,
  },
  ({ next }) => {
    it('should show correct hydration error when client and server render different text', async () => {
      const { cleanup, session } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
  'use client'
  const isClient = typeof window !== 'undefined'
  export default function Mismatch() {
      return (
        <div className="parent">
          <main className="child">{isClient ? "client" : "server"}</main>
        </div>
      );
    }
`,
          ],
        ])
      )

      await session.waitForAndOpenRuntimeError()

      expect(await session.getRedboxDescription()).toMatchInlineSnapshot(`
        "Error: Text content does not match server-rendered HTML.

        Warning: Text content did not match. Server: \\"server\\" Client: \\"client\\"

        See more info here: https://nextjs.org/docs/messages/react-hydration-error"
      `)

      await cleanup()
    })

    it('should show correct hydration error when client renders an extra element', async () => {
      const { cleanup, session } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
  'use client'
  const isClient = typeof window !== 'undefined'
  export default function Mismatch() {
        return (
          <div className="parent">
            {isClient && <main className="only" />}
          </div>
        );
      }
`,
          ],
        ])
      )

      await session.waitForAndOpenRuntimeError()

      expect(await session.getRedboxDescription()).toMatchInlineSnapshot(`
        "Error: Hydration failed because the initial UI does not match what was rendered on the server.

        Warning: Expected server HTML to contain a matching <main> in <div>.

        See more info here: https://nextjs.org/docs/messages/react-hydration-error"
      `)

      await cleanup()
    })
    it('should show correct hydration error when client renders an extra text node', async () => {
      const { cleanup, session } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
  'use client'
  const isClient = typeof window !== 'undefined'
  export default function Mismatch() {
        return (
          <div className="parent">
            <header className="1" />
            {isClient && "second"}
            <footer className="3" />
          </div>
        );
      }
`,
          ],
        ])
      )

      await session.waitForAndOpenRuntimeError()

      expect(await session.getRedboxDescription()).toMatchInlineSnapshot(`
        "Error: Hydration failed because the initial UI does not match what was rendered on the server.

        Warning: Expected server HTML to contain a matching text node for \\"second\\" in <div>.

        See more info here: https://nextjs.org/docs/messages/react-hydration-error"
      `)

      await cleanup()
    })

    it('should show correct hydration error when server renders an extra element', async () => {
      const { cleanup, session } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
  'use client'
  const isClient = typeof window !== 'undefined'
  export default function Mismatch() {
        return (
          <div className="parent">
            {!isClient && <main className="only" />}
          </div>
        );
      }
`,
          ],
        ])
      )

      await session.waitForAndOpenRuntimeError()

      expect(await session.getRedboxDescription()).toMatchInlineSnapshot(`
        "Error: Hydration failed because the initial UI does not match what was rendered on the server.

        Warning: Did not expect server HTML to contain a <main> in <div>.

        See more info here: https://nextjs.org/docs/messages/react-hydration-error"
      `)

      await cleanup()
    })

    it('should show correct hydration error when server renders an extra text node', async () => {
      const { cleanup, session } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
  'use client'
  const isClient = typeof window !== 'undefined'
  export default function Mismatch() {
        return <div className="parent">{!isClient && "only"}</div>;
      }
`,
          ],
        ])
      )

      await session.waitForAndOpenRuntimeError()

      expect(await session.getRedboxDescription()).toMatchInlineSnapshot(`
        "Error: Hydration failed because the initial UI does not match what was rendered on the server.

        Warning: Did not expect server HTML to contain the text node \\"only\\" in <div>.

        See more info here: https://nextjs.org/docs/messages/react-hydration-error"
      `)

      await cleanup()
    })

    it('should show correct hydration error when client renders an extra node inside Suspense content', async () => {
      const { cleanup, session } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
  'use client'
  import React from "react"
  const isClient = typeof window !== 'undefined'
  export default function Mismatch() {
        return (
          <div className="parent">
            <React.Suspense fallback={<p>Loading...</p>}>
              <header className="1" />
              {isClient && <main className="second" />}
              <footer className="3" />
            </React.Suspense>
          </div>
        );
      }
`,
          ],
        ])
      )

      await session.waitForAndOpenRuntimeError()

      expect(await session.getRedboxDescription()).toMatchInlineSnapshot(`
        "Error: Hydration failed because the initial UI does not match what was rendered on the server.

        Warning: Expected server HTML to contain a matching <main> in <div>.

        See more info here: https://nextjs.org/docs/messages/react-hydration-error"
      `)

      await cleanup()
    })
  }
)
