import { createPerson } from "./actions";

export function CreatePersonForm({ familyId }: { familyId: string }) {
  const action = createPerson.bind(null, familyId);
  return (
    <form action={action}>
      <input name="name" placeholder="Name" required />
      <select name="gender" required>
        <option value="">Gender</option>
        <option value="female">Female</option>
        <option value="male">Male</option>
        <option value="other">Other</option>
      </select>
      <input name="dateOfBirth" type="date" placeholder="Date of birth" />
      <input name="dateOfDeath" type="date" placeholder="Date of death" />
      <input name="heightCm" type="number" placeholder="Height (cm)" />
      <input name="weightKg" type="number" placeholder="Weight (kg)" />
      <input name="address" placeholder="Address" />
      <input name="email" type="email" placeholder="Email" />
      <input name="phone" placeholder="Phone" />
      <input name="occupation" placeholder="Occupation" />
      <textarea name="biography" placeholder="Biography" />
      <button type="submit">Add person</button>
    </form>
  );
}
