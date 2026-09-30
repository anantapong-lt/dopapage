import { db } from '../src/db'

const password = process.env.INITIAL_ACCOUNT_PASSWORD

if (!password) {
  throw new Error('INITIAL_ACCOUNT_PASSWORD is required')
}

const accounts = [
  { email: 'admin@gmail.com', username: 'admin', displayName: 'Admin', role: 'super_admin' },
  { email: 'writer@gmail.com', username: 'writer', displayName: 'Writer', role: 'writer' },
] as const

try {
  const passwordHash = await Bun.password.hash(password)

  await db.begin(async (transaction) => {
    for (const account of accounts) {
      const [user] = await transaction<{ id: string }[]>`
        INSERT INTO users (email, username, display_name, role, status, email_verified_at, deleted_at)
        VALUES (${account.email}, ${account.username}, ${account.displayName}, ${account.role}, 'active', NOW(), NULL)
        ON CONFLICT (LOWER(email)) DO UPDATE SET
          username = EXCLUDED.username,
          display_name = EXCLUDED.display_name,
          role = EXCLUDED.role,
          status = 'active',
          email_verified_at = COALESCE(users.email_verified_at, NOW()),
          deleted_at = NULL,
          updated_at = NOW()
        RETURNING id
      `

      if (!user) throw new Error(`Unable to create ${account.email}`)

      await transaction`
        INSERT INTO user_password_credentials (user_id, password_hash)
        VALUES (${user.id}, ${passwordHash})
        ON CONFLICT (user_id) DO UPDATE SET
          password_hash = EXCLUDED.password_hash,
          password_changed_at = NOW(),
          updated_at = NOW()
      `
    }
  })

  console.log('Initial admin and writer accounts are ready.')
} finally {
  await db.close()
}
