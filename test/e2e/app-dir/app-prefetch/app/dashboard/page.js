export const revalidate = 0

async function getData() {
  await new Promise((resolve) => setTimeout(resolve, 3000))
  return {
    message: 'Welcome to the dashboard',
  }
}
export default async function DashboardPage(props) {
  const { message } = await getData()

  return (
    <>
      <p id="dashboard-page">{message}</p>
    </>
  )
}
