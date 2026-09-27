import { db } from '../src/db'

const email = 'admin@gmail.com'
const username = `admin_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`
const displayName = 'Dopapage Admin'
const uppercaseCharacters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const lowercaseCharacters = 'abcdefghijkmnopqrstuvwxyz'
const numberCharacters = '23456789'
const symbolCharacters = ['!', '@', '#', '$', '%', '^', '&', '*', '_', '-'].join('')
const passwordCharacters = `${uppercaseCharacters}${lowercaseCharacters}${numberCharacters}${symbolCharacters}`

function randomCharacter(characters: string): string {
  const [byte] = crypto.getRandomValues(new Uint8Array(1))
  return characters[byte % characters.length] ?? ''
}

function createStrongPassword(length = 24): string {
  const characters = [
    randomCharacter(uppercaseCharacters),
    randomCharacter(lowercaseCharacters),
    randomCharacter(numberCharacters),
    randomCharacter(symbolCharacters),
  ]

  while (characters.length < length) characters.push(randomCharacter(passwordCharacters))

  for (let index = characters.length - 1; index > 0; index -= 1) {
    const [byte] = crypto.getRandomValues(new Uint8Array(1))
    const swapIndex = byte % (index + 1)
    ;[characters[index], characters[swapIndex]] = [characters[swapIndex] ?? '', characters[index] ?? '']
  }

  return characters.join('')
}

const password = createStrongPassword()

try {
  const passwordHash = await Bun.password.hash(password)

  await db.begin(async (transaction) => {
    const [user] = await transaction<{ id: string }[]>`
      INSERT INTO users (
        email,
        username,
        display_name,
        role,
        status,
        email_verified_at,
        deleted_at
      ) VALUES (
        ${email},
        ${username},
        ${displayName},
        'super_admin',
        'active',
        NOW(),
        NULL
      )
      ON CONFLICT (LOWER(email)) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        role = 'super_admin',
        status = 'active',
        email_verified_at = COALESCE(users.email_verified_at, NOW()),
        deleted_at = NULL,
        updated_at = NOW()
      RETURNING id
    `

    if (!user) throw new Error('Unable to create the admin user')

    await transaction`
      INSERT INTO user_password_credentials (user_id, password_hash)
      VALUES (${user.id}, ${passwordHash})
      ON CONFLICT (user_id) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        password_changed_at = NOW(),
        updated_at = NOW()
    `
  })

  console.log(`Admin account ready\nEmail: ${email}\nPassword: ${password}`)
  console.log('Store this password securely. Running the script again replaces it with a new password.')
} finally {
  await db.close()
}
