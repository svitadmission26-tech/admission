<script lang="ts">
    import HelpPage from '$lib/components/HelpPage.svelte';
    
    let { data } = $props();
</script>

<HelpPage title="Student Support Center">
    <div class="row">
        <div class="col-md-8">
            <h2 class="h4 mb-4">Frequently Asked Questions</h2>
            
            <div class="accordion" id="faqAccordion">
                <!-- FAQ Item 1 -->
                <div class="accordion-item">
                    <h2 class="accordion-header" id="headingOne">
                        <button class="accordion-button" type="button" data-bs-toggle="collapse" data-bs-target="#collapseOne" aria-expanded="true" aria-controls="collapseOne">
                            I made a mistake in my application. Can I edit it?
                        </button>
                    </h2>
                    <div id="collapseOne" class="accordion-collapse collapse show" aria-labelledby="headingOne" data-bs-parent="#faqAccordion">
                        <div class="accordion-body">
                            Once an application is <strong>Submitted</strong>, it cannot be edited by you directly. 
                            However, if the college verification team finds an error, they will mark your application as 
                            <strong>Needs Correction</strong>. You will then be able to edit the specific fields or re-upload documents.
                        </div>
                    </div>
                </div>

                <!-- FAQ Item 2 -->
                <div class="accordion-item">
                    <h2 class="accordion-header" id="headingTwo">
                        <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseTwo" aria-expanded="false" aria-controls="collapseTwo">
                            My payment was deducted but the status is still "Pending".
                        </button>
                    </h2>
                    <div id="collapseTwo" class="accordion-collapse collapse" aria-labelledby="headingTwo" data-bs-parent="#faqAccordion">
                        <div class="accordion-body">
                            Payments can sometimes take up to 24 hours to reflect. 
                            If the status doesn't update after that, please contact the support team with your 
                            <strong>Application ID</strong> and <strong>Transaction Reference Number</strong>.
                        </div>
                    </div>
                </div>

                <!-- FAQ Item 3 -->
                <div class="accordion-item">
                    <h2 class="accordion-header" id="headingThree">
                        <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseThree" aria-expanded="false" aria-controls="collapseThree">
                            How do I check the Merit List?
                        </button>
                    </h2>
                    <div id="collapseThree" class="accordion-collapse collapse" aria-labelledby="headingThree" data-bs-parent="#faqAccordion">
                        <div class="accordion-body">
                            Merit lists are published according to the schedule. You can check your status by logging in 
                            and viewing your <strong>Dashboard</strong>. If you are selected, you will see an "Admission Offer" 
                            notification.
                        </div>
                    </div>
                </div>

                <!-- FAQ Item 4 -->
                <div class="accordion-item">
                    <h2 class="accordion-header" id="headingFour">
                        <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseFour" aria-expanded="false" aria-controls="collapseFour">
                            I forgot my password. How can I reset it?
                        </button>
                    </h2>
                    <div id="collapseFour" class="accordion-collapse collapse" aria-labelledby="headingFour" data-bs-parent="#faqAccordion">
                        <div class="accordion-body">
                            Go to the Login page and click on the <strong>Forgot Password?</strong> link. 
                            Enter your registered email address to receive a password reset link.
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="col-md-4">
            <div class="card bg-light border-0">
                <div class="card-body">
                    <h3 class="h5 mb-3">Contact Us</h3>
                    <p class="mb-4 text-muted">Need further assistance? Reach out to our support team.</p>
                    
                    <ul class="list-unstyled">
                        <li class="mb-3 d-flex align-items-start">
                            <i class="bi bi-envelope-fill text-primary me-3 mt-1"></i>
                            <div>
                                <small class="text-muted d-block">Email Support</small>
                                <a href="mailto:{data.branding?.contact_email}" class="text-decoration-none">{data.branding?.contact_email || 'support@university.edu'}</a>
                            </div>
                        </li>
                        <li class="mb-3 d-flex align-items-start">
                            <i class="bi bi-telephone-fill text-primary me-3 mt-1"></i>
                            <div>
                                <small class="text-muted d-block">Phone Support</small>
                                <a href="tel:{data.branding?.contact_phone}" class="text-decoration-none">{data.branding?.contact_phone || '+1 234 567 890'}</a>
                            </div>
                        </li>
                        <li class="mb-3 d-flex align-items-start">
                            <i class="bi bi-globe text-primary me-3 mt-1"></i>
                            <div>
                                <small class="text-muted d-block">Website</small>
                                <a href={data.branding?.website} target="_blank" rel="noreferrer" class="text-decoration-none">{data.branding?.website || 'www.university.edu'}</a>
                            </div>
                        </li>
                    </ul>

                    <hr class="my-4">
                    
                    <h4 class="h6 mb-2">Office Hours</h4>
                    <p class="small text-muted mb-0">
                        Monday - Friday<br>
                        10:00 AM - 5:00 PM
                    </p>
                </div>
            </div>
        </div>
    </div>
</HelpPage>