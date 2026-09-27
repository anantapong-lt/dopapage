import { db } from '../src/db'

const email = 'test@Dopapage.local'
const username = 'test_user'
const password = 'Test1234!'

try {
  const passwordHash = await Bun.password.hash(password)

  await db`
    WITH test_user AS (
      INSERT INTO users (email, username, display_name, email_verified_at)
      VALUES (${email}, ${username}, 'Test User', NOW())
      ON CONFLICT (LOWER(email)) DO UPDATE SET
        username = EXCLUDED.username,
        display_name = EXCLUDED.display_name,
        status = 'active',
        deleted_at = NULL,
        updated_at = NOW()
      RETURNING id
    )
    INSERT INTO user_password_credentials (user_id, password_hash)
    SELECT id, ${passwordHash} FROM test_user
    ON CONFLICT (user_id) DO UPDATE SET
      password_hash = EXCLUDED.password_hash,
      password_changed_at = NOW(),
      updated_at = NOW()
  `

  console.log(`Test user created: ${email} / ${password}`)
} finally {
  await db.close()
}
